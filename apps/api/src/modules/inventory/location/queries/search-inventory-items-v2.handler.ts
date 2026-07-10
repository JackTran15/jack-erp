import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CompareFilterDto,
  CompareOperator,
  StringFilterDto,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { ItemEntity } from '../item.entity';
import {
  InventoryItemGroupRowDto,
  InventoryItemSearchV2ResponseDto,
} from '../dto/inventory-item-search-v2.dto';
import { SearchInventoryItemsV2Query } from './search-inventory-items-v2.query';

/**
 * Product-grouped inventory item search, fully pushed to SQL (mirrors
 * ItemCrudService.listProductGroups). A CTE builds one row per product
 * (orphans = items without a product) with aggregated columns; the per-column
 * filters, ordering and pagination then run at the DB level — the org's full
 * item set is never loaded into memory. Barcodes are aggregated via a
 * correlated subquery to avoid inflating the AVG/COUNT aggregates.
 */
const COMBINED_CTE = `
  WITH combined AS (
    SELECT
      'product'                                  AS type,
      p.id                                       AS id,
      COALESCE(p.code, p.name, MIN(i.code))      AS code,
      COALESCE(p.name, '')                       AS name,
      COALESCE((
        SELECT string_agg(DISTINCT b.code, ', ' ORDER BY b.code)
        FROM item_barcodes b
        JOIN items bi ON bi.id = b.item_id
        WHERE bi.product_id = p.id AND bi.organization_id = $1
      ), '')                                     AS barcode,
      COALESCE(MIN(i.unit), '')                  AS unit,
      MIN(i.brand)                               AS brand,
      AVG(i.purchase_price::numeric)::float      AS "purchasePrice",
      AVG(i.selling_price::numeric)::float       AS "sellingPrice",
      bool_and(i.is_pos_visible)                 AS "isPosVisible",
      bool_and(i.is_active)                      AS "isActive",
      COUNT(i.id)::int                           AS "itemCount"
    FROM products p
    INNER JOIN items i ON i.product_id = p.id AND i.organization_id = $1
    WHERE p.organization_id = $1
    GROUP BY p.id, p.code, p.name

    UNION ALL

    SELECT
      'orphan'                                   AS type,
      i.id                                       AS id,
      i.code                                     AS code,
      i.name                                     AS name,
      COALESCE((
        SELECT string_agg(DISTINCT b.code, ', ' ORDER BY b.code)
        FROM item_barcodes b
        WHERE b.item_id = i.id
      ), '')                                     AS barcode,
      i.unit                                     AS unit,
      i.brand                                    AS brand,
      i.purchase_price::float                    AS "purchasePrice",
      i.selling_price::float                     AS "sellingPrice",
      i.is_pos_visible                           AS "isPosVisible",
      i.is_active                                AS "isActive",
      0                                          AS "itemCount"
    FROM items i
    WHERE i.organization_id = $1 AND i.product_id IS NULL
  )
`;

interface CountRow {
  total: number;
}

@QueryHandler(SearchInventoryItemsV2Query)
export class SearchInventoryItemsV2Handler
  implements IQueryHandler<SearchInventoryItemsV2Query>
{
  constructor(
    @InjectRepository(ItemEntity)
    private readonly repo: Repository<ItemEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchInventoryItemsV2Query): Promise<InventoryItemSearchV2ResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    // $1 = orgId (referenced throughout the CTE); filter params start at $2.
    const params: unknown[] = [actor.organizationId];
    const where: string[] = [];

    this.applyString(where, params, 'code', dto.code);
    this.applyString(where, params, 'barcode', dto.barcode);
    this.applyString(where, params, 'name', dto.name);
    this.applyString(where, params, 'unit', dto.unit);
    this.applyString(where, params, 'brand', dto.brand);
    this.applyCompare(where, params, '"purchasePrice"', dto.purchasePrice);
    this.applyCompare(where, params, '"sellingPrice"', dto.sellingPrice);
    this.applyBool(where, params, '"isPosVisible"', dto.isPosVisible);
    this.applyBool(where, params, '"isActive"', dto.isActive);

    // Default-hide discontinued items unless the caller opts in (includeInactive)
    // or filters isActive explicitly. The literal predicate needs no param, so
    // the LIMIT/OFFSET placeholders keep their offset.
    if (dto.includeInactive !== true && dto.isActive === undefined) {
      where.push('"isActive" = true');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const dataSql = `
      ${COMBINED_CTE}
      SELECT * FROM combined
      ${whereSql}
      ORDER BY code ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const countSql = `
      ${COMBINED_CTE}
      SELECT COUNT(*)::int AS total FROM combined
      ${whereSql}
    `;

    const [data, countResult] = await Promise.all([
      this.repo.manager.query<InventoryItemGroupRowDto[]>(dataSql, [
        ...params,
        limit,
        offset,
      ]),
      this.repo.manager.query<CountRow[]>(countSql, params),
    ]);

    return { data, total: countResult[0]?.total ?? 0, page, limit };
  }

  /**
   * String filter on a (possibly null) text column. Wildcards in the user value
   * are escaped so they match literally — mirrors the in-memory `includes`/`===`
   * semantics. EQUALS compares the full lowercased value.
   */
  private applyString(
    where: string[],
    params: unknown[],
    col: string,
    filter?: StringFilterDto,
  ): void {
    const value = filter?.value?.trim();
    if (!value) return;
    const target = `COALESCE(${col}, '')`;
    const esc = value.replace(/[\\%_]/g, (c) => `\\${c}`);

    switch (filter!.operator) {
      case StringOperator.CONTAINS:
        params.push(`%${esc}%`);
        where.push(`${target} ILIKE $${params.length}`);
        break;
      case StringOperator.EQUALS:
        params.push(value);
        where.push(`lower(${target}) = lower($${params.length})`);
        break;
      case StringOperator.STARTS_WITH:
        params.push(`${esc}%`);
        where.push(`${target} ILIKE $${params.length}`);
        break;
      case StringOperator.ENDS_WITH:
        params.push(`%${esc}`);
        where.push(`${target} ILIKE $${params.length}`);
        break;
      case StringOperator.NOT_CONTAINS:
        params.push(`%${esc}%`);
        where.push(`${target} NOT ILIKE $${params.length}`);
        break;
    }
  }

  /** Numeric comparison on an aggregated money column. */
  private applyCompare(
    where: string[],
    params: unknown[],
    col: string,
    filter?: CompareFilterDto,
  ): void {
    if (!filter || filter.value === undefined || filter.value === '') return;
    const num = Number(filter.value);
    if (!Number.isFinite(num)) return;

    const op = COMPARE_SQL[filter.operator];
    if (!op) return;
    params.push(num);
    where.push(`${col} ${op} $${params.length}`);
  }

  private applyBool(
    where: string[],
    params: unknown[],
    col: string,
    value?: boolean,
  ): void {
    if (value === undefined) return;
    params.push(value);
    where.push(`${col} = $${params.length}`);
  }
}

const COMPARE_SQL: Record<CompareOperator, string> = {
  [CompareOperator.EQUALS]: '=',
  [CompareOperator.LT]: '<',
  [CompareOperator.LTE]: '<=',
  [CompareOperator.GT]: '>',
  [CompareOperator.GTE]: '>=',
};
