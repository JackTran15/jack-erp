import { BadRequestException } from '@nestjs/common';
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
/**
 * Signed on-hand total for one group, in a single branch.
 *
 * Three properties are load-bearing, one per acceptance criterion:
 *  - COALESCE(..., 0) — a group with no stock_balances row totals 0, so it still
 *    reads as out of stock instead of dropping out of the result;
 *  - SUM is NOT clamped — -1 and +1 must cancel to 0. Never wrap this in
 *    GREATEST(0, ...);
 *  - the branch is matched on stock_balances.branch_id, which is varchar while
 *    branches.id is uuid. The parameter is bound as text on purpose: casting it
 *    to ::uuid makes Postgres infer two conflicting types for one parameter.
 *    See ADR-02 — storages.branch_id is the documented-authoritative column, but
 *    this one matches the stock summary screen users cross-check against and hits
 *    IDX_stock_balances_org_branch_item.
 */
const stockTotalColumn = (itemPredicate: string, branchParam: number): string => `
      COALESCE((
        SELECT SUM(sb.quantity)
        FROM stock_balances sb
        JOIN locations loc ON loc.id = sb.location_id
        JOIN storages  st  ON st.id  = loc.storage_id
        WHERE ${itemPredicate}
          AND sb.organization_id = $1
          AND sb.branch_id = $${branchParam}
          AND sb.is_tracked = true
          AND loc.is_active = true
          AND st.is_active = true
      ), 0)                                      AS "stockTotal",`;

/** Row columns of the CTE, minus the internal "stockTotal" helper. */
const ROW_COLUMNS = `type, id, code, name, barcode, unit, brand,
      "purchasePrice", "sellingPrice", "isPosVisible", "isActive", "itemCount"`;

/**
 * `branchParam` is the placeholder index holding the branch id, set only when the
 * caller asked for the out-of-stock filter. When it is undefined the emitted SQL
 * is byte-for-byte what it was before the filter existed — no extra join, no
 * extra subquery — so the 99% of list loads that do not use the filter pay
 * nothing for it.
 */
const buildCombinedCte = (branchParam?: number): string => `
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
${
  branchParam === undefined
    ? ''
    : stockTotalColumn(
        'sb.item_id IN (SELECT i2.id FROM items i2 WHERE i2.product_id = p.id)',
        branchParam,
      )
}
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
${
  branchParam === undefined
    ? ''
    : stockTotalColumn('sb.item_id = i.id', branchParam)
}
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

    // $1 = orgId (referenced throughout the CTE); filter params start after it.
    const params: unknown[] = [actor.organizationId];
    const where: string[] = [];

    // The out-of-stock filter is scoped to the branch the actor is working in,
    // so its result set changes when the user switches branch. Without a branch
    // every group would total 0 and the whole catalogue would read as out of
    // stock — a silently wrong answer, so refuse instead of guessing.
    let branchParam: number | undefined;
    if (dto.outOfStock === true) {
      if (!actor.branchId) {
        throw new BadRequestException(
          'A branch must be selected to filter by out-of-stock status.',
        );
      }
      params.push(actor.branchId);
      branchParam = params.length;
    }

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

    // Sits alongside the column filters so it ANDs with them rather than
    // replacing them, and needs no parameter of its own.
    if (branchParam !== undefined) {
      where.push('"stockTotal" <= 0');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const cte = buildCombinedCte(branchParam);
    // "stockTotal" is an internal predicate helper, never part of the response
    // contract, so project it away when it exists.
    const selectList = branchParam === undefined ? '*' : ROW_COLUMNS;

    const dataSql = `
      ${cte}
      SELECT ${selectList} FROM combined
      ${whereSql}
      ORDER BY code ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const countSql = `
      ${cte}
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
