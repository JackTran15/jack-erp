import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Loại bỏ bút toán của phiếu đã xoá khỏi báo cáo (parity MISA): phiếu nhập bị
 * huỷ (deleted_at hoặc status CANCELLED) và phiếu xuất bị huỷ (status CANCELLED)
 * không còn xuất hiện. Bút toán gốc và bút toán đảo dùng chung reference_type +
 * reference_id nên cả hai cùng bị loại. Dùng alias `le` cho stock_ledger_entries.
 */
const EXCLUDE_VOIDED_DOCS_SQL = `
          AND NOT EXISTS (
            SELECT 1 FROM goods_receipts grx
            WHERE grx.id = le.reference_id
              AND le.reference_type = 'GOODS_RECEIPT'
              AND (grx.deleted_at IS NOT NULL OR grx.status = 'CANCELLED')
          )
          AND NOT EXISTS (
            SELECT 1 FROM goods_issues gix
            WHERE gix.id = le.reference_id
              AND le.reference_type = 'GOODS_ISSUE'
              AND gix.status = 'CANCELLED'
          )`;

export type StockPeriodGroupBy = 'item_location' | 'item_branch';

/** How the result rows are aggregated along the item dimension. */
export type ItemGroupBy = 'item' | 'parent' | 'group';
export const ITEM_GROUP_BY_VALUES: readonly ItemGroupBy[] = [
  'item',
  'parent',
  'group',
] as const;

export interface StockPeriodQuery {
  organizationId: string;
  /** Inclusive lower bound (UTC). */
  startDate: Date;
  /** Exclusive upper bound (UTC). */
  endDate: Date;
  /** Spatial dimension: per-location or per-branch. */
  groupBy: StockPeriodGroupBy;
  /** Item dimension: per-item, per-parent-product, or per-category. Default: 'item'. */
  itemGroupBy?: ItemGroupBy;
  /** Empty / undefined = no branch filter. */
  branchIds?: string[];
  /** Empty / undefined = no location filter. Only relevant for item_location groupBy. */
  locationIds?: string[];
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
 * Shared CTE-driven query engine for Báo cáo 1 / 3 / 4.
 *
 * Parameter layout — consistent across every SQL variant (data & count):
 *   $1  organizationId
 *   $2  startDate
 *   $3  endDate
 *   $4  branchIds   (text[] | null) — CTE filter
 *   $5  locationIds (text[] | null) — CTE filter
 *   $6  categoryIds (uuid[] | null) — item join / outer WHERE
 *   $7  search      (text   | null) — item join / outer WHERE
 *   $8  hideZeroRows (bool)         — outer WHERE
 *   $9  pageSize    (data only)
 *   $10 offset      (data only)
 *
 * All filters are parameterised; only whitelisted identifiers (group-by
 * expressions, table aliases) are interpolated into SQL strings.
 */
@Injectable()
export class StockPeriodService {
  constructor(private readonly dataSource: DataSource) {}

  async aggregate(query: StockPeriodQuery): Promise<StockPeriodResult> {
    const isLocation = query.groupBy === 'item_location';
    const groupKeyExpr = isLocation ? 'le.location_id' : 'le.branch_id';
    const itemGroupBy: ItemGroupBy = query.itemGroupBy ?? 'item';

    const branchIds =
      query.branchIds?.length ? query.branchIds : null;
    const locationIds =
      query.locationIds?.length ? query.locationIds : null;
    const categoryIds =
      query.categoryIds?.length ? query.categoryIds : null;
    const search =
      query.search?.trim().length ? query.search.trim() : null;
    const hideZeroRows = query.hideZeroRows === true;

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const offset = (page - 1) * pageSize;

    const combinedCte = this.buildCombinedCte(groupKeyExpr);

    const { dataSql, countSql } = itemGroupBy === 'item'
      ? this.buildItemSqls(combinedCte, isLocation)
      : this.buildAggSqls(combinedCte, isLocation, itemGroupBy);

    const baseParams = [
      query.organizationId, // $1
      query.startDate,      // $2
      query.endDate,        // $3
      branchIds,            // $4
      locationIds,          // $5
      categoryIds,          // $6
      search,               // $7
      hideZeroRows,         // $8
    ];

    const [rows, countRows] = await Promise.all([
      this.dataSource.query(dataSql, [...baseParams, pageSize, offset]),
      this.dataSource.query(countSql, baseParams),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const data = (rows as RawStockPeriodRow[]).map((r) =>
      this.mapRow(r, query.includeBreakdown === true, isLocation),
    );

    return { data, total };
  }

  // ─── SQL builders ────────────────────────────────────────────────────────────

  /**
   * itemGroupBy = 'item' — original per-item behaviour. Each (item, location/branch)
   * pair is a separate row.
   */
  private buildItemSqls(
    combinedCte: string,
    isLocation: boolean,
  ): { dataSql: string; countSql: string } {
    const locCols = isLocation
      ? `loc.id AS location_id, loc.code AS location_code, loc.name AS location_name,`
      : '';
    const branchCols = isLocation
      ? `NULL::uuid AS branch_id, NULL::text AS branch_code, NULL::text AS branch_name,`
      : `b.id AS branch_id, NULL::text AS branch_code, b.name AS branch_name,`;
    const joinLoc = isLocation
      ? 'LEFT JOIN locations loc ON loc.id = c.group_key'
      : '';
    const joinBranch = isLocation
      ? ''
      : 'LEFT JOIN branches b ON b.id::text = c.group_key';
    const orderBy = isLocation
      ? 'ORDER BY i.code ASC, loc.code ASC NULLS LAST'
      : 'ORDER BY i.code ASC, b.name ASC NULLS LAST';

    const dataSql = `
      WITH ${combinedCte}
      SELECT
        i.id          AS item_id,
        i.code        AS sku,
        i.name        AS item_name,
        pr.code       AS parent_sku,
        pr.name       AS parent_name,
        i.unit        AS unit,
        ic.id         AS category_id,
        ic.name       AS category_name,
        ${locCols}
        ${branchCols}
        c.opening_qty, c.opening_value,
        c.in_qty,      c.in_value,
        c.out_qty,     c.out_value,
        c.opening_qty + c.in_qty - c.out_qty     AS closing_qty,
        c.opening_value + c.in_value - c.out_value AS closing_value,
        c.in_qty_purchase, c.in_qty_transfer_in, c.in_qty_return, c.in_qty_adjust_in,
        c.out_qty_sale,    c.out_qty_transfer_out, c.out_qty_adjust_out
      FROM combined c
      JOIN  items i                     ON i.id  = c.item_id AND i.organization_id = $1
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN products pr             ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      ${joinLoc}
      ${joinBranch}
      WHERE ($6::uuid[] IS NULL OR i.category_id = ANY($6))
        AND ($7::text IS NULL OR i.code ILIKE '%' || $7 || '%' OR i.name ILIKE '%' || $7 || '%')
        AND ($8::boolean = FALSE OR NOT (c.opening_qty = 0 AND c.in_qty = 0 AND c.out_qty = 0))
      ${orderBy}
      LIMIT $9 OFFSET $10
    `;

    const countSql = `
      WITH ${combinedCte}
      SELECT COUNT(*)::int AS total
      FROM combined c
      JOIN items i ON i.id = c.item_id AND i.organization_id = $1
      WHERE ($6::uuid[] IS NULL OR i.category_id = ANY($6))
        AND ($7::text IS NULL OR i.code ILIKE '%' || $7 || '%' OR i.name ILIKE '%' || $7 || '%')
        AND ($8::boolean = FALSE OR NOT (c.opening_qty = 0 AND c.in_qty = 0 AND c.out_qty = 0))
    `;

    return { dataSql, countSql };
  }

  /**
   * itemGroupBy = 'parent' | 'group' — adds an `item_agg` CTE on top of `combined`
   * that re-aggregates quantities at the product ('parent') or category ('group') level.
   *
   * For 'parent': rows are keyed by product_id (or item_id for standalone items with no
   * parent product). For 'group': rows are keyed by category_id.
   */
  /**
   * itemGroupBy = 'parent' | 'group' — collapses all spatial dimensions so
   * each product (parent) or category (group) produces exactly ONE row with
   * totals across all locations/branches. Location/branch columns are NULL.
   */
  private buildAggSqls(
    combinedCte: string,
    _isLocation: boolean,
    itemGroupBy: 'parent' | 'group',
  ): { dataSql: string; countSql: string } {
    const aggKeyExpr =
      itemGroupBy === 'parent'
        ? `COALESCE(i.product_id::text, i.id::text)`
        : `i.category_id::text`;

    // group_key is intentionally excluded — we want one row per product/category
    // aggregated across ALL locations and branches.
    const itemAggCte = `
      item_agg AS (
        SELECT
          ${aggKeyExpr}                   AS agg_key,
          MIN(i.code)                     AS fallback_sku,
          MIN(i.name)                     AS fallback_name,
          SUM(c.opening_qty)              AS opening_qty,
          SUM(c.opening_value)            AS opening_value,
          SUM(c.in_qty)                   AS in_qty,
          SUM(c.in_value)                 AS in_value,
          SUM(c.out_qty)                  AS out_qty,
          SUM(c.out_value)                AS out_value,
          SUM(c.in_qty_purchase)          AS in_qty_purchase,
          SUM(c.in_qty_transfer_in)       AS in_qty_transfer_in,
          SUM(c.in_qty_return)            AS in_qty_return,
          SUM(c.in_qty_adjust_in)         AS in_qty_adjust_in,
          SUM(c.out_qty_sale)             AS out_qty_sale,
          SUM(c.out_qty_transfer_out)     AS out_qty_transfer_out,
          SUM(c.out_qty_adjust_out)       AS out_qty_adjust_out
        FROM combined c
        JOIN items i ON i.id = c.item_id AND i.organization_id = $1
        WHERE ($6::uuid[] IS NULL OR i.category_id = ANY($6))
          AND ($7::text IS NULL OR i.code ILIKE '%' || $7 || '%' OR i.name ILIKE '%' || $7 || '%')
        GROUP BY ${aggKeyExpr}
      )
    `;

    // Location and branch columns are all NULL — no spatial breakdown at this level.
    const nullSpatialCols = `
      NULL::uuid AS location_id,
      NULL::text AS location_code,
      NULL::text AS location_name,
      NULL::uuid AS branch_id,
      NULL::text AS branch_code,
      NULL::text AS branch_name,`;

    const displayCols =
      itemGroupBy === 'parent'
        ? `
          ia.agg_key                         AS item_id,
          COALESCE(p.code, ia.fallback_sku)  AS sku,
          COALESCE(p.name, ia.fallback_name) AS item_name,
          NULL::text AS parent_sku,
          NULL::text AS parent_name,
          NULL::text AS unit,
          NULL::uuid AS category_id,
          NULL::text AS category_name`
        : `
          ia.agg_key                                   AS item_id,
          NULL::text                                   AS sku,
          COALESCE(ic.name, 'Không phân nhóm')         AS item_name,
          NULL::text AS parent_sku,
          NULL::text AS parent_name,
          NULL::text AS unit,
          ia.agg_key                                   AS category_id,
          COALESCE(ic.name, 'Không phân nhóm')         AS category_name`;

    const joinLookup =
      itemGroupBy === 'parent'
        ? `LEFT JOIN products p ON p.id::text = ia.agg_key AND p.organization_id = $1`
        : `LEFT JOIN inventory_item_categories ic ON ic.id::text = ia.agg_key`;

    const orderByCol =
      itemGroupBy === 'parent'
        ? `COALESCE(p.code, ia.fallback_sku)`
        : `COALESCE(ic.name, 'Không phân nhóm')`;

    const dataSql = `
      WITH ${combinedCte},
      ${itemAggCte}
      SELECT
        ${displayCols},
        ${nullSpatialCols}
        ia.opening_qty, ia.opening_value,
        ia.in_qty,      ia.in_value,
        ia.out_qty,     ia.out_value,
        ia.opening_qty + ia.in_qty - ia.out_qty       AS closing_qty,
        ia.opening_value + ia.in_value - ia.out_value AS closing_value,
        ia.in_qty_purchase, ia.in_qty_transfer_in, ia.in_qty_return, ia.in_qty_adjust_in,
        ia.out_qty_sale,    ia.out_qty_transfer_out,   ia.out_qty_adjust_out
      FROM item_agg ia
      ${joinLookup}
      WHERE ($8::boolean = FALSE OR NOT (ia.opening_qty = 0 AND ia.in_qty = 0 AND ia.out_qty = 0))
      ORDER BY ${orderByCol} ASC NULLS LAST
      LIMIT $9 OFFSET $10
    `;

    const countSql = `
      WITH ${combinedCte},
      ${itemAggCte}
      SELECT COUNT(*)::int AS total
      FROM item_agg ia
      WHERE ($8::boolean = FALSE OR NOT (ia.opening_qty = 0 AND ia.in_qty = 0 AND ia.out_qty = 0))
    `;

    return { dataSql, countSql };
  }

  // ─── CTE builder (shared by all modes) ───────────────────────────────────────

  /**
   * Builds the `opening`, `in_period`, `out_period`, `combined` CTEs.
   * `groupKeyExpr` is one of the hard-coded strings `'le.location_id'` or
   * `'le.branch_id'`; no user input is interpolated.
   */
  private buildCombinedCte(groupKeyExpr: string): string {
    return `
      opening AS (
        SELECT
          le.item_id,
          ${groupKeyExpr} AS group_key,
          SUM(le.quantity)              AS qty,
          SUM(COALESCE(le.line_value, 0)) AS value
        FROM stock_ledger_entries le
        WHERE le.organization_id = $1
          AND le.posted_at < $2
          AND ($4::text[] IS NULL OR le.branch_id   = ANY($4::text[]))
          AND ($5::text[] IS NULL OR le.location_id::text = ANY($5::text[]))
          ${EXCLUDE_VOIDED_DOCS_SQL}
        GROUP BY le.item_id, ${groupKeyExpr}
      ),
      in_period AS (
        SELECT
          le.item_id,
          ${groupKeyExpr} AS group_key,
          SUM(le.quantity) FILTER (WHERE le.quantity > 0)              AS qty,
          SUM(COALESCE(le.line_value, 0)) FILTER (WHERE le.quantity > 0) AS value,
          SUM(CASE WHEN le.movement_type = 'PURCHASE_RECEIPT'    THEN le.quantity ELSE 0 END) AS qty_purchase,
          SUM(CASE WHEN le.movement_type = 'TRANSFER_IN'         THEN le.quantity ELSE 0 END) AS qty_transfer_in,
          SUM(CASE WHEN le.movement_type = 'RETURN_IN'           THEN le.quantity ELSE 0 END) AS qty_return,
          SUM(CASE WHEN le.movement_type = 'ADJUSTMENT_INCREASE' THEN le.quantity ELSE 0 END) AS qty_adjust_in
        FROM stock_ledger_entries le
        WHERE le.organization_id = $1
          AND le.posted_at >= $2
          AND le.posted_at <  $3
          AND ($4::text[] IS NULL OR le.branch_id   = ANY($4::text[]))
          AND ($5::text[] IS NULL OR le.location_id::text = ANY($5::text[]))
          ${EXCLUDE_VOIDED_DOCS_SQL}
        GROUP BY le.item_id, ${groupKeyExpr}
      ),
      out_period AS (
        SELECT
          le.item_id,
          ${groupKeyExpr} AS group_key,
          SUM(-le.quantity) FILTER (WHERE le.quantity < 0)              AS qty,
          SUM(-COALESCE(le.line_value, 0)) FILTER (WHERE le.quantity < 0) AS value,
          SUM(CASE WHEN le.movement_type = 'SALE_ISSUE'           THEN -le.quantity ELSE 0 END) AS qty_sale,
          SUM(CASE WHEN le.movement_type = 'TRANSFER_OUT'         THEN -le.quantity ELSE 0 END) AS qty_transfer_out,
          SUM(CASE WHEN le.movement_type = 'ADJUSTMENT_DECREASE'  THEN -le.quantity ELSE 0 END) AS qty_adjust_out
        FROM stock_ledger_entries le
        WHERE le.organization_id = $1
          AND le.posted_at >= $2
          AND le.posted_at <  $3
          AND ($4::text[] IS NULL OR le.branch_id   = ANY($4::text[]))
          AND ($5::text[] IS NULL OR le.location_id::text = ANY($5::text[]))
          ${EXCLUDE_VOIDED_DOCS_SQL}
        GROUP BY le.item_id, ${groupKeyExpr}
      ),
      combined AS (
        SELECT
          COALESCE(o.item_id,    ip.item_id,    op.item_id)    AS item_id,
          COALESCE(o.group_key,  ip.group_key,  op.group_key)  AS group_key,
          COALESCE(o.qty,  0)  AS opening_qty,
          COALESCE(o.value, 0) AS opening_value,
          COALESCE(ip.qty,  0) AS in_qty,
          COALESCE(ip.value, 0) AS in_value,
          COALESCE(op.qty,  0) AS out_qty,
          COALESCE(op.value, 0) AS out_value,
          COALESCE(ip.qty_purchase,    0) AS in_qty_purchase,
          COALESCE(ip.qty_transfer_in, 0) AS in_qty_transfer_in,
          COALESCE(ip.qty_return,      0) AS in_qty_return,
          COALESCE(ip.qty_adjust_in,   0) AS in_qty_adjust_in,
          COALESCE(op.qty_sale,         0) AS out_qty_sale,
          COALESCE(op.qty_transfer_out, 0) AS out_qty_transfer_out,
          COALESCE(op.qty_adjust_out,   0) AS out_qty_adjust_out
        FROM opening o
        FULL OUTER JOIN in_period ip
          ON  o.item_id   = ip.item_id   AND o.group_key  = ip.group_key
        FULL OUTER JOIN out_period op
          ON  COALESCE(o.item_id,  ip.item_id)  = op.item_id
          AND COALESCE(o.group_key, ip.group_key) = op.group_key
      )
    `;
  }

  // ─── Row mapper ──────────────────────────────────────────────────────────────

  private mapRow(
    raw: RawStockPeriodRow,
    includeBreakdown: boolean,
    isLocation: boolean,
  ): StockPeriodRow {
    const row: StockPeriodRow = {
      itemId: raw.item_id,
      sku: raw.sku ?? '',
      itemName: raw.item_name ?? '',
      parentSku: raw.parent_sku ?? null,
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

/** Raw row shape returned by pg — NUMERIC columns come back as strings. */
interface RawStockPeriodRow {
  item_id: string;
  sku: string | null;
  item_name: string | null;
  parent_sku: string | null;
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
