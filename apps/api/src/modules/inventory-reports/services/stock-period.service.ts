import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type StockPeriodGroupBy = 'item_location' | 'item_branch';

export interface StockPeriodQuery {
  organizationId: string;
  /** Inclusive lower bound (UTC). */
  startDate: Date;
  /** Exclusive upper bound (UTC). */
  endDate: Date;
  groupBy: StockPeriodGroupBy;
  /** Empty / undefined = no branch filter. */
  branchIds?: string[];
  /** Empty / undefined = no category filter. */
  categoryIds?: string[];
  /** Matches `items.code` or `items.name` (ILIKE). */
  search?: string;
  /** When true, adds IN/OUT subcategory breakdown columns. */
  includeBreakdown?: boolean;
  /** Filter where all of opening_qty / in_qty / out_qty are zero. */
  hideZeroRows?: boolean;
  page: number;
  pageSize: number;
}

export interface StockPeriodRow {
  itemId: string;
  sku: string;
  itemName: string;
  parentSku: string | null;
  parentName: string | null;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  // Either location-level OR branch-level identity, depending on groupBy.
  locationId?: string;
  locationCode?: string;
  locationName?: string;
  branchId: string | null;
  branchCode: string | null;
  branchName: string | null;
  // Period totals
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  closingQty: number;
  closingValue: number;
  // Optional breakdown (only if includeBreakdown=true)
  inQtyPurchase?: number;
  inQtyTransferIn?: number;
  inQtyReturn?: number;
  inQtyAdjustIn?: number;
  outQtySale?: number;
  outQtyTransferOut?: number;
  outQtyAdjustOut?: number;
}

export interface StockPeriodResult {
  data: StockPeriodRow[];
  total: number;
}

/**
 * Shared CTE-driven query engine that powers Báo cáo 1 (stock summary),
 * Báo cáo 3 (stock quantity details) and Báo cáo 4 (stock by branch).
 *
 * The query has three phases that are joined on a "group key":
 *   - opening   : sum of all signed ledger entries whose `posted_at < startDate`
 *   - in_period : positive entries in [startDate, endDate)
 *   - out_period: negative entries in [startDate, endDate)
 *
 * The group key is either `location_id` (Báo cáo 1 / 3) or `branch_id`
 * (Báo cáo 4). All filters are parameterised — never interpolated — to
 * defeat SQL injection. The `groupBy` value is whitelisted in code, so
 * it can be safely embedded in the SQL string.
 */
@Injectable()
export class StockPeriodService {
  constructor(private readonly dataSource: DataSource) {}

  async aggregate(query: StockPeriodQuery): Promise<StockPeriodResult> {
    const isLocation = query.groupBy === 'item_location';
    const groupKeyExpr = isLocation ? 'le.location_id' : 'le.branch_id';

    // Normalise array filters: empty arrays should be treated as "no filter"
    // so the `($n::uuid[] IS NULL OR ...)` short-circuit kicks in.
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
    const hideZeroRows = query.hideZeroRows === true;

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const offset = (page - 1) * pageSize;

    const combinedCte = this.buildCombinedCte(groupKeyExpr);

    // Outer SELECT — items + (location|branch) + category metadata.
    const outerSelectLocationCols = isLocation
      ? `loc.id AS location_id,
         loc.code AS location_code,
         loc.name AS location_name,`
      : '';

    const outerJoinLocation = isLocation
      ? 'LEFT JOIN locations loc ON loc.id = c.group_key'
      : '';

    // For both modes we need a branch join. In item_location mode we still
    // want the branch metadata for display (derived from the ledger row);
    // since the CTE only carries one group key, we resolve branch via the
    // location's "default" parent — but locations don't carry a branch id
    // directly. The pragmatic choice: in item_location mode we look up
    // the most recent ledger entry's branch per (item, location). To keep
    // the query simple and deterministic, we instead skip per-row branch
    // metadata for item_location mode and return null branch fields.
    //
    // In item_branch mode the group key IS the branch id, so the join is
    // direct and the metadata is unambiguous.
    const outerSelectBranchCols = isLocation
      ? `NULL::uuid AS branch_id,
         NULL::text AS branch_code,
         NULL::text AS branch_name,`
      : `b.id AS branch_id,
         NULL::text AS branch_code,
         b.name AS branch_name,`;

    const outerJoinBranch = isLocation
      ? ''
      : 'LEFT JOIN branches b ON b.id::text = c.group_key';

    const orderBy = isLocation
      ? 'ORDER BY i.code ASC, loc.code ASC NULLS LAST'
      : 'ORDER BY i.code ASC, b.name ASC NULLS LAST';

    const dataSql = `
      WITH ${combinedCte}
      SELECT
        i.id AS item_id,
        i.code AS sku,
        i.name AS item_name,
        pr.name AS parent_name,
        i.unit AS unit,
        ic.id AS category_id,
        ic.name AS category_name,
        ${outerSelectLocationCols}
        ${outerSelectBranchCols}
        c.opening_qty,
        c.opening_value,
        c.in_qty,
        c.in_value,
        c.out_qty,
        c.out_value,
        c.opening_qty + c.in_qty - c.out_qty AS closing_qty,
        c.opening_value + c.in_value - c.out_value AS closing_value,
        c.in_qty_purchase,
        c.in_qty_transfer_in,
        c.in_qty_return,
        c.in_qty_adjust_in,
        c.out_qty_sale,
        c.out_qty_transfer_out,
        c.out_qty_adjust_out
      FROM combined c
      JOIN items i ON i.id = c.item_id AND i.organization_id = $1
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      ${outerJoinLocation}
      ${outerJoinBranch}
      WHERE ($5::uuid[] IS NULL OR i.category_id = ANY($5))
        AND ($6::text IS NULL OR i.code ILIKE '%' || $6 || '%' OR i.name ILIKE '%' || $6 || '%')
        AND ($7::boolean = FALSE OR NOT (c.opening_qty = 0 AND c.in_qty = 0 AND c.out_qty = 0))
      ${orderBy}
      LIMIT $8 OFFSET $9
    `;

    const countSql = `
      WITH ${combinedCte}
      SELECT COUNT(*)::int AS total
      FROM combined c
      JOIN items i ON i.id = c.item_id AND i.organization_id = $1
      WHERE ($5::uuid[] IS NULL OR i.category_id = ANY($5))
        AND ($6::text IS NULL OR i.code ILIKE '%' || $6 || '%' OR i.name ILIKE '%' || $6 || '%')
        AND ($7::boolean = FALSE OR NOT (c.opening_qty = 0 AND c.in_qty = 0 AND c.out_qty = 0))
    `;

    const dataParams = [
      query.organizationId, // $1
      query.startDate, // $2
      query.endDate, // $3
      branchIds, // $4 (uuid[] or null)
      categoryIds, // $5 (uuid[] or null)
      search, // $6 (text or null)
      hideZeroRows, // $7 (bool)
      pageSize, // $8
      offset, // $9
    ];

    const countParams = [
      query.organizationId,
      query.startDate,
      query.endDate,
      branchIds,
      categoryIds,
      search,
      hideZeroRows,
    ];

    const [rows, countRows] = await Promise.all([
      this.dataSource.query(dataSql, dataParams),
      this.dataSource.query(countSql, countParams),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const data = (rows as RawStockPeriodRow[]).map((r) =>
      this.mapRow(r, query.includeBreakdown === true, isLocation),
    );

    return { data, total };
  }

  /**
   * Build the WITH ... combined sub-CTE. `groupKeyExpr` is one of the
   * hard-coded strings 'le.location_id' or 'le.branch_id'; no user input
   * is interpolated.
   */
  private buildCombinedCte(groupKeyExpr: string): string {
    return `
      opening AS (
        SELECT
          le.item_id,
          ${groupKeyExpr} AS group_key,
          SUM(le.quantity) AS qty,
          SUM(COALESCE(le.line_value, 0)) AS value
        FROM stock_ledger_entries le
        WHERE le.organization_id = $1
          AND le.posted_at < $2
          AND ($4::text[] IS NULL OR le.branch_id = ANY($4::text[]))
        GROUP BY le.item_id, ${groupKeyExpr}
      ),
      in_period AS (
        SELECT
          le.item_id,
          ${groupKeyExpr} AS group_key,
          SUM(le.quantity) FILTER (WHERE le.quantity > 0) AS qty,
          SUM(COALESCE(le.line_value, 0)) FILTER (WHERE le.quantity > 0) AS value,
          SUM(CASE WHEN le.movement_type = 'PURCHASE_RECEIPT' THEN le.quantity ELSE 0 END) AS qty_purchase,
          SUM(CASE WHEN le.movement_type = 'TRANSFER_IN' THEN le.quantity ELSE 0 END) AS qty_transfer_in,
          SUM(CASE WHEN le.movement_type = 'RETURN_IN' THEN le.quantity ELSE 0 END) AS qty_return,
          SUM(CASE WHEN le.movement_type = 'ADJUSTMENT_INCREASE' THEN le.quantity ELSE 0 END) AS qty_adjust_in
        FROM stock_ledger_entries le
        WHERE le.organization_id = $1
          AND le.posted_at >= $2
          AND le.posted_at < $3
          AND ($4::text[] IS NULL OR le.branch_id = ANY($4::text[]))
        GROUP BY le.item_id, ${groupKeyExpr}
      ),
      out_period AS (
        SELECT
          le.item_id,
          ${groupKeyExpr} AS group_key,
          SUM(-le.quantity) FILTER (WHERE le.quantity < 0) AS qty,
          SUM(-COALESCE(le.line_value, 0)) FILTER (WHERE le.quantity < 0) AS value,
          SUM(CASE WHEN le.movement_type = 'SALE_ISSUE' THEN -le.quantity ELSE 0 END) AS qty_sale,
          SUM(CASE WHEN le.movement_type = 'TRANSFER_OUT' THEN -le.quantity ELSE 0 END) AS qty_transfer_out,
          SUM(CASE WHEN le.movement_type = 'ADJUSTMENT_DECREASE' THEN -le.quantity ELSE 0 END) AS qty_adjust_out
        FROM stock_ledger_entries le
        WHERE le.organization_id = $1
          AND le.posted_at >= $2
          AND le.posted_at < $3
          AND ($4::text[] IS NULL OR le.branch_id = ANY($4::text[]))
        GROUP BY le.item_id, ${groupKeyExpr}
      ),
      combined AS (
        SELECT
          COALESCE(o.item_id, ip.item_id, op.item_id) AS item_id,
          COALESCE(o.group_key, ip.group_key, op.group_key) AS group_key,
          COALESCE(o.qty, 0) AS opening_qty,
          COALESCE(o.value, 0) AS opening_value,
          COALESCE(ip.qty, 0) AS in_qty,
          COALESCE(ip.value, 0) AS in_value,
          COALESCE(op.qty, 0) AS out_qty,
          COALESCE(op.value, 0) AS out_value,
          COALESCE(ip.qty_purchase, 0) AS in_qty_purchase,
          COALESCE(ip.qty_transfer_in, 0) AS in_qty_transfer_in,
          COALESCE(ip.qty_return, 0) AS in_qty_return,
          COALESCE(ip.qty_adjust_in, 0) AS in_qty_adjust_in,
          COALESCE(op.qty_sale, 0) AS out_qty_sale,
          COALESCE(op.qty_transfer_out, 0) AS out_qty_transfer_out,
          COALESCE(op.qty_adjust_out, 0) AS out_qty_adjust_out
        FROM opening o
        FULL OUTER JOIN in_period ip
          ON o.item_id = ip.item_id AND o.group_key = ip.group_key
        FULL OUTER JOIN out_period op
          ON COALESCE(o.item_id, ip.item_id) = op.item_id
         AND COALESCE(o.group_key, ip.group_key) = op.group_key
      )
    `;
  }

  private mapRow(
    raw: RawStockPeriodRow,
    includeBreakdown: boolean,
    isLocation: boolean,
  ): StockPeriodRow {
    const row: StockPeriodRow = {
      itemId: raw.item_id,
      sku: raw.sku,
      itemName: raw.item_name,
      parentSku: raw.parent_name ?? null,
      parentName: raw.parent_name ?? null,
      unit: raw.unit ?? '',
      categoryId: raw.category_id ?? null,
      categoryName: raw.category_name ?? null,
      branchId: raw.branch_id ?? null,
      branchCode: raw.branch_code ?? null,
      branchName: raw.branch_name ?? null,
      openingQty: Number(raw.opening_qty ?? 0),
      openingValue: Number(raw.opening_value ?? 0),
      inQty: Number(raw.in_qty ?? 0),
      inValue: Number(raw.in_value ?? 0),
      outQty: Number(raw.out_qty ?? 0),
      outValue: Number(raw.out_value ?? 0),
      closingQty: Number(raw.closing_qty ?? 0),
      closingValue: Number(raw.closing_value ?? 0),
    };

    if (isLocation) {
      row.locationId = raw.location_id ?? undefined;
      row.locationCode = raw.location_code ?? undefined;
      row.locationName = raw.location_name ?? undefined;
    }

    if (includeBreakdown) {
      row.inQtyPurchase = Number(raw.in_qty_purchase ?? 0);
      row.inQtyTransferIn = Number(raw.in_qty_transfer_in ?? 0);
      row.inQtyReturn = Number(raw.in_qty_return ?? 0);
      row.inQtyAdjustIn = Number(raw.in_qty_adjust_in ?? 0);
      row.outQtySale = Number(raw.out_qty_sale ?? 0);
      row.outQtyTransferOut = Number(raw.out_qty_transfer_out ?? 0);
      row.outQtyAdjustOut = Number(raw.out_qty_adjust_out ?? 0);
    }

    return row;
  }
}

/** Raw row shape returned by the CTE — pg returns NUMERIC as string. */
interface RawStockPeriodRow {
  item_id: string;
  sku: string;
  item_name: string;
  parent_name: string | null;
  unit: string | null;
  category_id: string | null;
  category_name: string | null;
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  branch_id: string | null;
  branch_code: string | null;
  branch_name: string | null;
  opening_qty: string | number | null;
  opening_value: string | number | null;
  in_qty: string | number | null;
  in_value: string | number | null;
  out_qty: string | number | null;
  out_value: string | number | null;
  closing_qty: string | number | null;
  closing_value: string | number | null;
  in_qty_purchase: string | number | null;
  in_qty_transfer_in: string | number | null;
  in_qty_return: string | number | null;
  in_qty_adjust_in: string | number | null;
  out_qty_sale: string | number | null;
  out_qty_transfer_out: string | number | null;
  out_qty_adjust_out: string | number | null;
}
