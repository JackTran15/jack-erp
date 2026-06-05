import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type ItemGroupBy } from './stock-period.service';

export interface StockBalancePivotQuery {
  organizationId: string;
  itemGroupBy?: ItemGroupBy;
  branchIds?: string[];
  categoryIds?: string[];
  search?: string;
  page: number;
  pageSize: number;
}

export interface StockBalancePivotBranchCell {
  branchId: string;
  branchName: string;
  qty: number;
  value: number;
}

export interface StockBalancePivotRow {
  itemId: string;
  sku: string;
  name: string;
  parentSku: string | null;
  parentName: string | null;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  totalQty: number;
  totalValue: number;
  perBranch: Record<string, StockBalancePivotBranchCell>;
}

export interface StockBalancePivotBranchHeader {
  id: string;
  code: string | null;
  name: string;
}

export interface StockBalancePivotResult {
  data: StockBalancePivotRow[];
  branches: StockBalancePivotBranchHeader[];
  total: number;
}

/**
 * Báo cáo 5 — Số lượng tồn theo cửa hàng (pivot).
 *
 * Supports three item-dimension modes (itemGroupBy):
 *   'item'   — one row per SKU  (default)
 *   'parent' — one row per parent product (variants aggregated)
 *   'group'  — one row per category
 */
@Injectable()
export class StockBalancePivotService {
  constructor(private readonly dataSource: DataSource) {}

  async aggregate(query: StockBalancePivotQuery): Promise<StockBalancePivotResult> {
    const itemGroupBy: ItemGroupBy = query.itemGroupBy ?? 'item';
    const branchIds = query.branchIds?.length ? query.branchIds : null;
    const categoryIds = query.categoryIds?.length ? query.categoryIds : null;
    const search = query.search?.trim().length ? query.search.trim() : null;

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const offset = (page - 1) * pageSize;

    if (itemGroupBy === 'item') {
      return this.aggregateByItem(
        query.organizationId, branchIds, categoryIds, search, page, pageSize, offset,
      );
    }
    return this.aggregateByAgg(
      query.organizationId, branchIds, categoryIds, search, page, pageSize, offset, itemGroupBy,
    );
  }

  // ─── item mode (original behaviour) ─────────────────────────────────────────

  private async aggregateByItem(
    orgId: string,
    branchIds: string[] | null,
    categoryIds: string[] | null,
    search: string | null,
    page: number,
    pageSize: number,
    offset: number,
  ): Promise<StockBalancePivotResult> {
    const itemPageSql = `
      SELECT i.id AS item_id, i.code AS sku
      FROM items i
      WHERE i.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM stock_balances sb
          WHERE sb.organization_id = $1 AND sb.item_id = i.id
            AND ($2::text[] IS NULL OR sb.branch_id = ANY($2::text[]))
        )
        AND ($3::uuid[] IS NULL OR i.category_id = ANY($3))
        AND ($4::text IS NULL OR i.code ILIKE '%' || $4 || '%' OR i.name ILIKE '%' || $4 || '%')
      ORDER BY i.code ASC
      LIMIT $5 OFFSET $6
    `;
    const itemCountSql = `
      SELECT COUNT(*)::int AS total
      FROM items i
      WHERE i.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM stock_balances sb
          WHERE sb.organization_id = $1 AND sb.item_id = i.id
            AND ($2::text[] IS NULL OR sb.branch_id = ANY($2::text[]))
        )
        AND ($3::uuid[] IS NULL OR i.category_id = ANY($3))
        AND ($4::text IS NULL OR i.code ILIKE '%' || $4 || '%' OR i.name ILIKE '%' || $4 || '%')
    `;
    const baseParams = [orgId, branchIds, categoryIds, search];

    const [itemRows, countRows] = await Promise.all([
      this.dataSource.query(itemPageSql, [...baseParams, pageSize, offset]),
      this.dataSource.query(itemCountSql, baseParams),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const itemIds = (itemRows as Array<{ item_id: string }>).map((r) => r.item_id);
    if (itemIds.length === 0) return { data: [], branches: [], total };

    const cellSql = `
      SELECT
        i.id             AS agg_key,
        i.code           AS sku,
        i.name           AS item_name,
        pr.code          AS parent_sku,
        pr.name          AS parent_name,
        i.unit           AS unit,
        ic.id            AS category_id,
        ic.name          AS category_name,
        b.id             AS branch_id,
        b.name           AS branch_name,
        SUM(sb.quantity)::numeric                                AS qty,
        SUM(sb.quantity * COALESCE(i.purchase_price, 0))::numeric AS value
      FROM stock_balances sb
      JOIN  items i   ON i.id = sb.item_id AND i.organization_id = $1
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      LEFT JOIN branches b  ON b.id::text = sb.branch_id
      WHERE sb.organization_id = $1
        AND sb.item_id = ANY($2)
        AND ($3::text[] IS NULL OR sb.branch_id = ANY($3::text[]))
      GROUP BY i.id, i.code, i.name, pr.code, pr.name, i.unit, ic.id, ic.name, b.id, b.name
      ORDER BY i.code ASC, b.name ASC NULLS LAST
    `;
    const cellRows = (await this.dataSource.query(cellSql, [
      orgId, itemIds, branchIds,
    ])) as RawPivotCell[];

    return this.foldCells(cellRows, itemIds, total);
  }

  // ─── parent / group aggregation ──────────────────────────────────────────────

  private async aggregateByAgg(
    orgId: string,
    branchIds: string[] | null,
    categoryIds: string[] | null,
    search: string | null,
    page: number,
    pageSize: number,
    offset: number,
    itemGroupBy: 'parent' | 'group',
  ): Promise<StockBalancePivotResult> {
    const isParent = itemGroupBy === 'parent';

    const aggKeyExpr = isParent
      ? `COALESCE(i.product_id::text, i.id::text)`
      : `i.category_id::text`;
    const displaySkuExpr = isParent
      ? `COALESCE(pr.code, i.code)`
      : `ic.name`;
    const joinProduct = isParent
      ? `LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = $1`
      : '';
    const joinCategory = isParent
      ? `LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id`
      : `LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id`;

    // Step 1: paginate distinct agg_keys
    const pageParams = [orgId, branchIds, categoryIds, search];
    const aggPageSql = `
      SELECT DISTINCT
        ${aggKeyExpr} AS agg_key,
        ${isParent ? `COALESCE(pr.code, i.code)` : `COALESCE(ic.name, 'Không phân nhóm')`} AS display_sku
      FROM items i
      ${joinProduct}
      ${joinCategory}
      WHERE i.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM stock_balances sb
          WHERE sb.organization_id = $1 AND sb.item_id = i.id
            AND ($2::text[] IS NULL OR sb.branch_id = ANY($2::text[]))
        )
        AND ($3::uuid[] IS NULL OR i.category_id = ANY($3))
        AND ($4::text IS NULL OR i.code ILIKE '%' || $4 || '%' OR i.name ILIKE '%' || $4 || '%')
      ORDER BY display_sku ASC NULLS LAST
      LIMIT $5 OFFSET $6
    `;
    const aggCountSql = `
      SELECT COUNT(DISTINCT ${aggKeyExpr})::int AS total
      FROM items i
      ${joinProduct}
      WHERE i.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM stock_balances sb
          WHERE sb.organization_id = $1 AND sb.item_id = i.id
            AND ($2::text[] IS NULL OR sb.branch_id = ANY($2::text[]))
        )
        AND ($3::uuid[] IS NULL OR i.category_id = ANY($3))
        AND ($4::text IS NULL OR i.code ILIKE '%' || $4 || '%' OR i.name ILIKE '%' || $4 || '%')
    `;

    const [aggRows, countRows] = await Promise.all([
      this.dataSource.query(aggPageSql, [...pageParams, pageSize, offset]),
      this.dataSource.query(aggCountSql, pageParams),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const aggKeys = (aggRows as Array<{ agg_key: string }>)
      .map((r) => r.agg_key)
      .filter(Boolean);
    if (aggKeys.length === 0) return { data: [], branches: [], total };

    // Step 2: fetch per-(agg_key, branch) aggregates for the page
    const cellSql = isParent
      ? `
        SELECT
          ${aggKeyExpr}                                           AS agg_key,
          COALESCE(pr.code, MIN(i.code))                         AS sku,
          COALESCE(pr.name, MIN(i.name))                         AS item_name,
          NULL::text                                             AS parent_sku,
          NULL::text                                             AS parent_name,
          NULL::text                                             AS unit,
          NULL::uuid                                             AS category_id,
          NULL::text                                             AS category_name,
          b.id                                                   AS branch_id,
          b.name                                                 AS branch_name,
          SUM(sb.quantity)::numeric                               AS qty,
          SUM(sb.quantity * COALESCE(i.purchase_price, 0))::numeric AS value
        FROM stock_balances sb
        JOIN  items i  ON i.id = sb.item_id AND i.organization_id = $1
        LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
        LEFT JOIN branches b  ON b.id::text = sb.branch_id
        WHERE sb.organization_id = $1
          AND ${aggKeyExpr} = ANY($2)
          AND ($3::text[] IS NULL OR sb.branch_id = ANY($3::text[]))
        GROUP BY ${aggKeyExpr}, pr.code, pr.name, b.id, b.name
        ORDER BY COALESCE(pr.code, MIN(i.code)) ASC NULLS LAST, b.name ASC NULLS LAST
      `
      : `
        SELECT
          i.category_id::text                                    AS agg_key,
          COALESCE(ic.name, 'Không phân nhóm')                   AS sku,
          COALESCE(ic.name, 'Không phân nhóm')                   AS item_name,
          NULL::text                                             AS parent_sku,
          NULL::text                                             AS parent_name,
          NULL::text                                             AS unit,
          i.category_id::text                                    AS category_id,
          COALESCE(ic.name, 'Không phân nhóm')                   AS category_name,
          b.id                                                   AS branch_id,
          b.name                                                 AS branch_name,
          SUM(sb.quantity)::numeric                               AS qty,
          SUM(sb.quantity * COALESCE(i.purchase_price, 0))::numeric AS value
        FROM stock_balances sb
        JOIN  items i  ON i.id = sb.item_id AND i.organization_id = $1
        LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
        LEFT JOIN branches b  ON b.id::text = sb.branch_id
        WHERE sb.organization_id = $1
          AND i.category_id::text = ANY($2)
          AND ($3::text[] IS NULL OR sb.branch_id = ANY($3::text[]))
        GROUP BY i.category_id, ic.name, b.id, b.name
        ORDER BY COALESCE(ic.name, 'Không phân nhóm') ASC NULLS LAST, b.name ASC NULLS LAST
      `;

    const cellRows = (await this.dataSource.query(cellSql, [
      orgId, aggKeys, branchIds,
    ])) as RawPivotCell[];

    return this.foldCells(cellRows, aggKeys, total);
  }

  // ─── shared fold ─────────────────────────────────────────────────────────────

  private foldCells(
    cellRows: RawPivotCell[],
    orderedKeys: string[],
    total: number,
  ): StockBalancePivotResult {
    const rowByKey = new Map<string, StockBalancePivotRow>();
    const branchById = new Map<string, StockBalancePivotBranchHeader>();

    for (const cell of cellRows) {
      if (!cell.branch_id) continue;

      let row = rowByKey.get(cell.agg_key);
      if (!row) {
        row = {
          itemId: cell.agg_key,
          sku: cell.sku ?? '',
          name: cell.item_name ?? '',
          parentSku: cell.parent_sku ?? null,
          parentName: cell.parent_name ?? null,
          unit: cell.unit ?? '',
          categoryId: cell.category_id ?? null,
          categoryName: cell.category_name ?? null,
          totalQty: 0,
          totalValue: 0,
          perBranch: {},
        };
        rowByKey.set(cell.agg_key, row);
      }

      const qty = Number(cell.qty ?? 0);
      const value = Number(cell.value ?? 0);
      row.totalQty += qty;
      row.totalValue += value;
      row.perBranch[cell.branch_id] = {
        branchId: cell.branch_id,
        branchName: cell.branch_name ?? '',
        qty,
        value,
      };

      if (!branchById.has(cell.branch_id)) {
        branchById.set(cell.branch_id, {
          id: cell.branch_id,
          code: null,
          name: cell.branch_name ?? '',
        });
      }
    }

    const data: StockBalancePivotRow[] = [];
    for (const key of orderedKeys) {
      const row = rowByKey.get(key);
      if (row) data.push(row);
    }

    const branches = Array.from(branchById.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'vi'),
    );

    return { data, branches, total };
  }
}

interface RawPivotCell {
  agg_key: string;
  sku: string | null;
  item_name: string | null;
  parent_sku: string | null;
  parent_name: string | null;
  unit: string | null;
  category_id: string | null;
  category_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  qty: string | number | null;
  value: string | number | null;
}
