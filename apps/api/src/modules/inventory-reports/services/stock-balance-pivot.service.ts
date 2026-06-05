import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface StockBalancePivotQuery {
  organizationId: string;
  /** Empty / undefined = no branch filter. */
  branchIds?: string[];
  /** Empty / undefined = no category filter. */
  categoryIds?: string[];
  /** Matches `items.code` or `items.name` (ILIKE). */
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
  /** Keyed by branchId so the frontend can look up by the discovered branch list. */
  perBranch: Record<string, StockBalancePivotBranchCell>;
}

export interface StockBalancePivotBranchHeader {
  id: string;
  /** `branches` table does not currently carry a `code` column — kept nullable so a future column add is transparent. */
  code: string | null;
  name: string;
}

export interface StockBalancePivotResult {
  data: StockBalancePivotRow[];
  /** Distinct branches encountered across the (filtered) result set — FE renders one column per entry. */
  branches: StockBalancePivotBranchHeader[];
  /** Total number of items (NOT branch-cell rows) for pagination. */
  total: number;
}

/**
 * Báo cáo 5 — Số lượng tồn theo cửa hàng (pivot).
 *
 * One row per item, one column per branch. The pivot is done in TS rather
 * than `crosstab` because branch lists are dynamic per org.
 *
 * Strategy:
 *   1. First query pages the distinct item IDs that match the filters
 *      (org / branch / category / search). Pagination happens here, before
 *      we expand into per-branch cells.
 *   2. Second query fetches per-(item, branch) aggregates for that page.
 *   3. TS folds the raw cells into one row per item, accumulating totals
 *      and the per-branch cell map. The discovered branch list is built up
 *      from the same cells so the FE knows which columns to render.
 *
 * Stock value uses `items.purchase_price` as the cost basis — the same
 * approximation used elsewhere when ledger `line_value` isn't available.
 */
@Injectable()
export class StockBalancePivotService {
  constructor(private readonly dataSource: DataSource) {}

  async aggregate(
    query: StockBalancePivotQuery,
  ): Promise<StockBalancePivotResult> {
    const branchIds =
      query.branchIds && query.branchIds.length > 0 ? query.branchIds : null;
    const categoryIds =
      query.categoryIds && query.categoryIds.length > 0
        ? query.categoryIds
        : null;
    const search =
      query.search && query.search.trim().length > 0
        ? query.search.trim()
        : null;

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const offset = (page - 1) * pageSize;

    // ── Step 1: paginate item IDs that have at least one matching balance ──
    const itemPageSql = `
      SELECT i.id AS item_id, i.code AS sku
      FROM items i
      WHERE i.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM stock_balances sb
          WHERE sb.organization_id = $1
            AND sb.item_id = i.id
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
          WHERE sb.organization_id = $1
            AND sb.item_id = i.id
            AND ($2::text[] IS NULL OR sb.branch_id = ANY($2::text[]))
        )
        AND ($3::uuid[] IS NULL OR i.category_id = ANY($3))
        AND ($4::text IS NULL OR i.code ILIKE '%' || $4 || '%' OR i.name ILIKE '%' || $4 || '%')
    `;

    const [itemRows, countRows] = await Promise.all([
      this.dataSource.query(itemPageSql, [
        query.organizationId,
        branchIds,
        categoryIds,
        search,
        pageSize,
        offset,
      ]),
      this.dataSource.query(itemCountSql, [
        query.organizationId,
        branchIds,
        categoryIds,
        search,
      ]),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const itemIds = (itemRows as Array<{ item_id: string }>).map(
      (r) => r.item_id,
    );

    if (itemIds.length === 0) {
      return { data: [], branches: [], total };
    }

    // ── Step 2: fetch per-(item, branch) aggregates for the page ──
    // We GROUP BY item + branch and sum across the underlying locations.
    // `purchase_price` × qty is used as the value approximation.
    const cellSql = `
      SELECT
        i.id AS item_id,
        i.code AS sku,
        i.name AS item_name,
        pr.name AS parent_name,
        i.unit AS unit,
        ic.id AS category_id,
        ic.name AS category_name,
        b.id AS branch_id,
        b.name AS branch_name,
        SUM(sb.quantity)::numeric AS qty,
        SUM(sb.quantity * COALESCE(i.purchase_price, 0))::numeric AS value
      FROM stock_balances sb
      JOIN items i ON i.id = sb.item_id AND i.organization_id = $1
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      LEFT JOIN branches b ON b.id::text = sb.branch_id
      WHERE sb.organization_id = $1
        AND sb.item_id = ANY($2)
        AND ($3::text[] IS NULL OR sb.branch_id = ANY($3::text[]))
      GROUP BY i.id, i.code, i.name, pr.name, i.unit, ic.id, ic.name, b.id, b.name
      ORDER BY i.code ASC, b.name ASC NULLS LAST
    `;

    const cellRows = (await this.dataSource.query(cellSql, [
      query.organizationId,
      itemIds,
      branchIds,
    ])) as RawPivotCell[];

    // ── Step 3: fold into pivot rows + discovered branch list ──
    const rowByItem = new Map<string, StockBalancePivotRow>();
    const branchByid = new Map<string, StockBalancePivotBranchHeader>();

    for (const cell of cellRows) {
      // Skip orphan balances whose branch row is missing — they'd produce
      // a column with no name; safer to drop them than render "Unknown".
      if (!cell.branch_id) continue;

      let row = rowByItem.get(cell.item_id);
      if (!row) {
        row = {
          itemId: cell.item_id,
          sku: cell.sku,
          name: cell.item_name,
          parentSku: cell.parent_name ?? null,
          parentName: cell.parent_name ?? null,
          unit: cell.unit ?? '',
          categoryId: cell.category_id ?? null,
          categoryName: cell.category_name ?? null,
          totalQty: 0,
          totalValue: 0,
          perBranch: {},
        };
        rowByItem.set(cell.item_id, row);
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

      if (!branchByid.has(cell.branch_id)) {
        branchByid.set(cell.branch_id, {
          id: cell.branch_id,
          code: null,
          name: cell.branch_name ?? '',
        });
      }
    }

    // Preserve item ordering from step 1 (by SKU).
    const data: StockBalancePivotRow[] = [];
    for (const id of itemIds) {
      const row = rowByItem.get(id);
      if (row) data.push(row);
    }

    const branches = Array.from(branchByid.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'vi'),
    );

    return { data, branches, total };
  }
}

interface RawPivotCell {
  item_id: string;
  sku: string;
  item_name: string;
  parent_name: string | null;
  unit: string | null;
  category_id: string | null;
  category_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  qty: string | number | null;
  value: string | number | null;
}
