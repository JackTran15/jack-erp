import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CompareFilterDto,
  CompareOperator,
  StringFilterDto,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { ProductEntity } from '../product.entity';
import {
  ProductSearchV2ResponseDto,
  ProductSearchV2RowDto,
} from '../dto/product-search-v2.dto';
import { SearchProductsV2Query } from './search-products-v2.query';

/**
 * Variant-grouped product search, fully pushed to SQL (mirrors the inventory
 * items v2 handler). A CTE builds one row per product with its variant items
 * aggregated (count, avg selling price, distinct brands); the per-column
 * filters, ordering and pagination then run at the DB level so the org's full
 * product set is never loaded into memory. Items are LEFT JOINed so products
 * without variants still appear.
 */
const GROUPED_CTE = `
  WITH grouped AS (
    SELECT
      p.id                                       AS id,
      p.code                                     AS code,
      p.name                                     AS name,
      p.description                              AS description,
      p.is_active                                AS "isActive",
      p.created_at                               AS "createdAt",
      string_agg(DISTINCT i.brand, ', ' ORDER BY i.brand) AS brand,
      COALESCE(AVG(i.selling_price::numeric), 0)::float   AS "sellingPrice",
      COUNT(i.id)::int                           AS "variantCount"
    FROM products p
    LEFT JOIN items i ON i.product_id = p.id AND i.organization_id = $1
    WHERE p.organization_id = $1
    GROUP BY p.id, p.code, p.name, p.description, p.is_active, p.created_at
  )
`;

interface CountRow {
  total: number;
}

@QueryHandler(SearchProductsV2Query)
export class SearchProductsV2Handler
  implements IQueryHandler<SearchProductsV2Query>
{
  constructor(
    @InjectRepository(ProductEntity)
    private readonly repo: Repository<ProductEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchProductsV2Query): Promise<ProductSearchV2ResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    // $1 = orgId (referenced throughout the CTE); filter params start at $2.
    const params: unknown[] = [actor.organizationId];
    const where: string[] = [];

    this.applyString(where, params, 'code', dto.code);
    this.applyString(where, params, 'name', dto.name);
    this.applyString(where, params, 'description', dto.description);
    this.applyString(where, params, 'brand', dto.brand);
    this.applyCompare(where, params, '"sellingPrice"', dto.sellingPrice);
    this.applyCompare(where, params, '"variantCount"', dto.variantCount);
    this.applyBool(where, params, '"isActive"', dto.isActive);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const dataSql = `
      ${GROUPED_CTE}
      SELECT * FROM grouped
      ${whereSql}
      ORDER BY name ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const countSql = `
      ${GROUPED_CTE}
      SELECT COUNT(*)::int AS total FROM grouped
      ${whereSql}
    `;

    const [data, countResult] = await Promise.all([
      this.repo.manager.query<ProductSearchV2RowDto[]>(dataSql, [
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
   * are escaped so they match literally. EQUALS compares the full lowercased value.
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

  /** Numeric comparison on an aggregated column. */
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
