import { Injectable } from '@nestjs/common';
import type { ReportTotals } from '@erp/shared-interfaces';
import {
  buildReportColumnFilter,
  type ReportColumnFilters,
  type ReportColumnSpecs,
} from './report-column-filter.util';
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
  /** Lọc theo cột, áp phía server nên tác dụng trên toàn tập. */
  columnFilters?: ReportColumnFilters;
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
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  /** Primary provider's name; null when the item has none. Item grain only. */
  supplier?: string | null;
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
  transferOutQty: number;
  transferOutValue: number;
  incomingQty: number;
  incomingValue: number;
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
  /**
   * SUM của từng cột số trên toàn bộ kết quả lọc. Khoá trùng tên field của
   * dòng. Cột dẫn xuất (`closingQty`, `closingValue`) không nằm ở đây — FE tự
   * suy ra từ opening/in/out để footer khớp đúng công thức của từng dòng.
   */
  totals: ReportTotals;
}

/**
 * Cột nào lọc được và tổng được, cho từng nhánh SQL.
 *
 * `item` chiếu từ `combined c` + `items i`; `parent`/`group` chiếu từ `item_agg ia`.
 * Hai cột điều chuyển (`transferOutQty` / `incomingQty`) chưa có mặt ở đây: chúng
 * còn được ghép bằng JS theo trang, và được nâng lên SQL ở UOW-06.
 */
const NUMERIC_PERIOD_COLUMNS = [
  'openingQty',
  'openingValue',
  'inQty',
  'inValue',
  'outQty',
  'outValue',
  'inQtyPurchase',
  'inQtyTransferIn',
  'inQtyReturn',
  'inQtyAdjustIn',
  'outQtySale',
  'outQtyTransferOut',
  'outQtyAdjustOut',
] as const;

const NUMERIC_COLUMN_SQL: Record<string, string> = {
  openingQty: 'opening_qty',
  openingValue: 'opening_value',
  inQty: 'in_qty',
  inValue: 'in_value',
  outQty: 'out_qty',
  outValue: 'out_value',
  inQtyPurchase: 'in_qty_purchase',
  inQtyTransferIn: 'in_qty_transfer_in',
  inQtyReturn: 'in_qty_return',
  inQtyAdjustIn: 'in_qty_adjust_in',
  outQtySale: 'out_qty_sale',
  outQtyTransferOut: 'out_qty_transfer_out',
  outQtyAdjustOut: 'out_qty_adjust_out',
};

/**
 * `màu sắc` / `size` live in the attribute tables rather than on `items`, so the
 * cell is a correlated lookup. The filter has to use the SAME expression the row
 * displays — hence one constant, referenced by both the SELECT list and the spec.
 */
const COLOR_SQL = `(SELECT pao.value_label FROM item_attribute_values iav
         JOIN product_attribute_definitions pad ON pad.id = iav.attribute_definition_id
         JOIN product_attribute_options pao ON pao.id = iav.option_id
         WHERE iav.item_id = i.id AND LOWER(pad.name) IN ('màu sắc', 'màu', 'color')
         LIMIT 1)`;

const SIZE_SQL = `(SELECT pao.value_label FROM item_attribute_values iav
         JOIN product_attribute_definitions pad ON pad.id = iav.attribute_definition_id
         JOIN product_attribute_options pao ON pao.id = iav.option_id
         WHERE iav.item_id = i.id AND LOWER(pad.name) = 'size'
         LIMIT 1)`;

/**
 * Joins the item-level text specs depend on.
 *
 * `dataSql` has always carried these; `countSql` never did, because until now no
 * predicate referenced them. Both queries take the SAME filter fragment, so a
 * spec pointing at `ic.name` breaks the count with 42P01 unless the join lands
 * in both places (ADR-04). All three are many-to-one, so the row count is
 * unchanged — which the specs assert.
 */
const ITEM_TEXT_JOINS = `
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      LEFT JOIN item_providers ip ON ip.item_id = i.id AND ip.is_primary = TRUE
        AND ip.organization_id = i.organization_id
      LEFT JOIN inventory_providers pv ON pv.id = ip.provider_id`;

function periodColumnSpecs(
  alias: string,
  withText: boolean,
  withLocation = false,
): ReportColumnSpecs {
  const specs: ReportColumnSpecs = {};
  for (const key of NUMERIC_PERIOD_COLUMNS) {
    specs[key] = { sql: `${alias}.${NUMERIC_COLUMN_SQL[key]}`, kind: 'number' };
  }
  // Derived columns still filter, using the same arithmetic each row displays.
  // Keys stay the row field names; a grid that labels the column differently
  // maps its own key on the way out (see toColumnFilterPayload's keyMap).
  specs.closingQty = {
    sql: `(${alias}.opening_qty + ${alias}.in_qty - ${alias}.out_qty)`,
    kind: 'number',
  };
  specs.closingValue = {
    sql: `(${alias}.opening_value + ${alias}.in_value - ${alias}.out_value)`,
    kind: 'number',
  };
  if (withText) {
    specs.sku = { sql: 'i.code', kind: 'text' };
    specs.itemName = { sql: 'i.name', kind: 'text' };
    specs.unit = { sql: 'i.unit', kind: 'text' };
    specs.brand = { sql: 'i.brand', kind: 'text' };
    specs.parentSku = { sql: 'pr.code', kind: 'text' };
    specs.parentName = { sql: 'pr.name', kind: 'text' };
    specs.categoryName = { sql: 'ic.name', kind: 'text' };
    specs.color = { sql: COLOR_SQL, kind: 'text' };
    specs.size = { sql: SIZE_SQL, kind: 'text' };
    // Safe to join and safe to count: UQ_item_providers_primary is a unique
    // index on (item_id) WHERE is_primary, so at most one row can match and the
    // join cannot multiply rows (A-04).
    specs.supplier = { sql: 'pv.name', kind: 'text' };
    specs.transferOutQty = { sql: 'COALESCE(pout.qty, 0)', kind: 'number' };
    specs.transferOutValue = { sql: 'COALESCE(pout.val, 0)', kind: 'number' };
    specs.incomingQty = { sql: 'COALESCE(pin.qty, 0)', kind: 'number' };
    specs.incomingValue = { sql: 'COALESCE(pin.val, 0)', kind: 'number' };
  }
  // Only the item_location grain has a location; on item_branch these columns
  // are absent from the row, so filtering them is refused rather than ignored.
  if (withText && withLocation) {
    specs.locationCode = { sql: 'loc.code', kind: 'text' };
    specs.locationName = { sql: 'loc.name', kind: 'text' };
  }
  // `branches` has no code column — every query selects `NULL::text AS
  // branch_code` — so `branchCode` deliberately gets no spec and filtering it
  // answers 400 rather than silently matching nothing.
  if (withText && !withLocation) {
    specs.branchName = { sql: 'b.name', kind: 'text' };
  }
  return specs;
}

/**
 * Pending inter-branch transfers, as CTEs the main query can join.
 *
 * Replaces `applyPendingTransfers`, which stitched these four columns on in JS
 * after the page was in hand — the reason they could be neither filtered nor
 * paged on, and the reason the footer needed `buildRowKeysSql` to replay the
 * same stitching over the whole set.
 *
 * Two deliberate changes of meaning, both decided in ADR-07:
 *
 * 1. "Sắp nhận về" now sums EVERY pending order heading for a destination
 *    branch. The JS version deduplicated on (item, destination branch) and kept
 *    only the first, which under-counted an item arriving from two sources —
 *    and "first" was whatever Postgres happened to return, since the query had
 *    no ORDER BY. There was no well-defined behaviour to preserve.
 * 2. A transfer order records a destination BRANCH but no destination location,
 *    so on the per-location grain the branch figure is attributed to that
 *    branch's default receiving location.
 *
 * "Đang chuyển đi" is unchanged: it always summed every order and never deduped.
 */
function pendingTransferCtes(isLocation: boolean): string {
  const outKey = isLocation ? 'pb.source_location_id' : 'pb.source_branch_id';
  // The destination side has no location of its own, so it borrows one.
  const inKey = isLocation ? 'dr.location_id' : 'pb.destination_branch_id';
  const inJoin = isLocation
    // storages.branch_id is uuid while transfer_orders.destination_branch_id is
    // varchar, so the cast is required — the same direction the rest of this
    // file already casts in (`b.id::text = c.group_key`).
    ? 'JOIN default_receiving dr ON dr.branch_id::text = pb.destination_branch_id'
    : '';

  return `
      pending_base AS (
        SELECT
          tl.item_id,
          tl.source_location_id,
          tord.source_branch_id,
          tord.destination_branch_id,
          SUM(tl.requested_qty)::numeric AS quantity,
          SUM(
            tl.requested_qty *
            COALESCE(export_price.unit_price, it.purchase_price, 0)
          )::numeric AS value
        FROM transfer_orders tord
        INNER JOIN transfer_order_lines tl
          ON tl.transfer_order_id = tord.id
         AND tl.organization_id = tord.organization_id
        INNER JOIN items it
          ON it.id = tl.item_id AND it.organization_id = tord.organization_id
        LEFT JOIN (
          SELECT gil.item_id, gil.goods_issue_id, MAX(gil.unit_price)::numeric AS unit_price
          FROM goods_issue_lines gil
          GROUP BY gil.item_id, gil.goods_issue_id
        ) export_price
          ON export_price.goods_issue_id = tord.export_goods_issue_id
         AND export_price.item_id = tl.item_id
        WHERE tord.organization_id = $1
          AND tord.status = 'IN_PROGRESS'
          AND tord.deleted_at IS NULL
          AND (
            $4::text[] IS NULL
            OR tord.source_branch_id = ANY($4)
            OR tord.destination_branch_id = ANY($4)
          )
          AND ($6::uuid[] IS NULL OR it.category_id = ANY($6))
          AND ($7::text IS NULL OR it.code ILIKE '%' || $7 || '%' OR it.name ILIKE '%' || $7 || '%')
        GROUP BY tl.item_id, tl.source_location_id,
                 tord.source_branch_id, tord.destination_branch_id
      ),
      -- One landing spot per branch. Ordered explicitly rather than relying on
      -- there being a single candidate: a branch configured differently must
      -- still give a stable answer instead of whatever the planner returns.
      default_receiving AS (
        SELECT DISTINCT ON (st.branch_id)
               st.branch_id, loc_r.id AS location_id
        FROM storages st
        JOIN locations loc_r ON loc_r.storage_id = st.id
        WHERE st.is_default_receiving = TRUE
        ORDER BY st.branch_id, loc_r.is_default DESC,
                 loc_r.is_unassigned DESC, loc_r.code ASC
      ),
      pending_out AS (
        SELECT pb.item_id, ${outKey} AS group_key,
               SUM(pb.quantity)::numeric AS qty,
               SUM(pb.value)::numeric    AS val
        FROM pending_base pb
        WHERE ${outKey} IS NOT NULL
        GROUP BY pb.item_id, ${outKey}
      ),
      pending_in AS (
        SELECT pb.item_id, ${inKey} AS group_key,
               SUM(pb.quantity)::numeric AS qty,
               SUM(pb.value)::numeric    AS val
        FROM pending_base pb
        ${inJoin}
        WHERE ${inKey} IS NOT NULL
        GROUP BY pb.item_id, ${inKey}
      )`;
}

/**
 * The four transfer columns sum from the joined CTEs rather than from `combined`,
 * so they need their own SELECT list — and it has to sit in the same count query
 * as everything else, or the footer describes a different set than the grid.
 */
const TRANSFER_TOTALS_SELECT = `
             COALESCE(SUM(COALESCE(pout.qty, 0)), 0)::numeric AS transfer_out_qty,
             COALESCE(SUM(COALESCE(pout.val, 0)), 0)::numeric AS transfer_out_value,
             COALESCE(SUM(COALESCE(pin.qty, 0)), 0)::numeric  AS incoming_qty,
             COALESCE(SUM(COALESCE(pin.val, 0)), 0)::numeric  AS incoming_value`;

const TRANSFER_TOTAL_KEYS: Record<string, string> = {
  transferOutQty: 'transfer_out_qty',
  transferOutValue: 'transfer_out_value',
  incomingQty: 'incoming_qty',
  incomingValue: 'incoming_value',
};

/** The joins the four transfer specs and their totals resolve against. */
const PENDING_JOINS = `
      LEFT JOIN pending_out pout ON pout.item_id = c.item_id AND pout.group_key = c.group_key
      LEFT JOIN pending_in  pin  ON pin.item_id  = c.item_id AND pin.group_key  = c.group_key`;

/** SUM(...) cho mọi cột số, dùng chung cho câu count của cả hai nhánh. */
function periodTotalsSelect(alias: string): string {
  return NUMERIC_PERIOD_COLUMNS.map(
    (key) =>
      `COALESCE(SUM(${alias}.${NUMERIC_COLUMN_SQL[key]}), 0)::numeric AS ${NUMERIC_COLUMN_SQL[key]}`,
  ).join(',\n             ');
}

/** Đọc hàng count+totals thành map khoá theo tên field của dòng. */
function readPeriodTotals(raw: Record<string, unknown> | undefined): ReportTotals {
  const totals: ReportTotals = {};
  for (const key of NUMERIC_PERIOD_COLUMNS) {
    totals[key] = Number(raw?.[NUMERIC_COLUMN_SQL[key]] ?? 0);
  }
  for (const [key, column] of Object.entries(TRANSFER_TOTAL_KEYS)) {
    if (raw?.[column] !== undefined) totals[key] = Number(raw[column]);
  }
  return totals;
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

    const isItemLevel = itemGroupBy === 'item';
    const combinedCte =
      this.buildCombinedCte(groupKeyExpr) +
      (isItemLevel ? `,${pendingTransferCtes(isLocation)}` : '');

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

    // One fragment, spliced into both the rows query and the count+totals
    // query, so the footer can never describe a different set than the grid.
    const columnFilter = buildReportColumnFilter(
      query.columnFilters,
      periodColumnSpecs(isItemLevel ? 'c' : 'ia', isItemLevel, isLocation),
      baseParams.length,
    );
    const filterWhere = columnFilter.where ? `AND ${columnFilter.where}` : '';
    const filteredParams = [...baseParams, ...columnFilter.params];
    const limitIndex = filteredParams.length + 1;

    const { dataSql, countSql } = isItemLevel
      ? this.buildItemSqls(combinedCte, isLocation, filterWhere, limitIndex)
      : this.buildAggSqls(combinedCte, isLocation, itemGroupBy, filterWhere, limitIndex);

    // At the item grain SQL now owns the four transfer columns, so neither the
    // extra pending query nor the row-key replay that existed to keep the footer
    // in step with them has anything left to do. The parent/group grain never
    // matched a pending row anyway — its `item_id` is really an aggregate key —
    // so it keeps the old path and the same zeros it always produced.
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(dataSql, [...filteredParams, pageSize, offset]),
      this.dataSource.query(countSql, filteredParams),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const totals = readPeriodTotals(countRows[0]);
    const data = (rows as RawStockPeriodRow[]).map((r) =>
      this.mapRow(r, query.includeBreakdown === true, isLocation),
    );

    return { data, total, totals };
  }

  /**
   * itemGroupBy = 'item' — original per-item behaviour. Each (item, location/branch)
   * pair is a separate row.
   */
  private buildItemSqls(
    combinedCte: string,
    isLocation: boolean,
    filterWhere: string,
    limitIndex: number,
  ): { dataSql: string; countSql: string } {
    // dataSql walks locations → storages → branches for its columns; the count
    // only needs whichever relation the group key names, and joining the rest
    // would be dead weight on a query that already scans the whole period
    // (ADR-04). Both are many-to-one, so neither changes the row count.
    const joinLocForFilter = isLocation
      ? 'LEFT JOIN locations loc ON loc.id = c.group_key'
      : 'LEFT JOIN branches b ON b.id::text = c.group_key';
    const locCols = isLocation
      ? `loc.id AS location_id, loc.code AS location_code, loc.name AS location_name,`
      : '';
    const branchCols = isLocation
      ? `b.id AS branch_id, NULL::text AS branch_code, b.name AS branch_name,`
      : `b.id AS branch_id, NULL::text AS branch_code, b.name AS branch_name,`;
    const joinLoc = isLocation
      ? `LEFT JOIN locations loc ON loc.id = c.group_key
         LEFT JOIN storages storage ON storage.id = loc.storage_id
         LEFT JOIN branches b ON b.id = storage.branch_id`
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
        i.brand       AS brand,
        pv.name       AS supplier,
        ${locCols}
        ${branchCols}
        c.opening_qty, c.opening_value,
        c.in_qty,      c.in_value,
        c.out_qty,     c.out_value,
        c.opening_qty + c.in_qty - c.out_qty     AS closing_qty,
        c.opening_value + c.in_value - c.out_value AS closing_value,
        c.in_qty_purchase, c.in_qty_transfer_in, c.in_qty_return, c.in_qty_adjust_in,
        c.out_qty_sale,    c.out_qty_transfer_out, c.out_qty_adjust_out,
        COALESCE(pout.qty, 0) AS transfer_out_qty,
        COALESCE(pout.val, 0) AS transfer_out_value,
        COALESCE(pin.qty, 0)  AS incoming_qty,
        COALESCE(pin.val, 0)  AS incoming_value,
        ${COLOR_SQL} AS color,
        ${SIZE_SQL} AS size
      FROM combined c
      JOIN  items i                     ON i.id  = c.item_id AND i.organization_id = $1
      ${ITEM_TEXT_JOINS}
      ${PENDING_JOINS}
      ${joinLoc}
      ${joinBranch}
      WHERE ($6::uuid[] IS NULL OR i.category_id = ANY($6))
        AND ($7::text IS NULL OR i.code ILIKE '%' || $7 || '%' OR i.name ILIKE '%' || $7 || '%')
        AND ($8::boolean = FALSE OR NOT (c.opening_qty = 0 AND c.in_qty = 0 AND c.out_qty = 0))
        ${filterWhere}
      ${orderBy}
      LIMIT $${limitIndex} OFFSET $${limitIndex + 1}
    `;

    // Count and totals in one pass over exactly the rows the grid will show.
    const countSql = `
      WITH ${combinedCte}
      SELECT COUNT(*)::int AS total,
             ${periodTotalsSelect('c')},
             ${TRANSFER_TOTALS_SELECT}
      FROM combined c
      JOIN items i ON i.id = c.item_id AND i.organization_id = $1
      ${ITEM_TEXT_JOINS}
      ${PENDING_JOINS}
      ${joinLocForFilter}
      WHERE ($6::uuid[] IS NULL OR i.category_id = ANY($6))
        AND ($7::text IS NULL OR i.code ILIKE '%' || $7 || '%' OR i.name ILIKE '%' || $7 || '%')
        AND ($8::boolean = FALSE OR NOT (c.opening_qty = 0 AND c.in_qty = 0 AND c.out_qty = 0))
        ${filterWhere}
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
    filterWhere: string,
    limitIndex: number,
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
      NULL::text AS branch_name,
      NULL::text AS brand,
      NULL::text AS color,
      NULL::text AS size,`;

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
        ${filterWhere}
      ORDER BY ${orderByCol} ASC NULLS LAST
      LIMIT $${limitIndex} OFFSET $${limitIndex + 1}
    `;

    const countSql = `
      WITH ${combinedCte},
      ${itemAggCte}
      SELECT COUNT(*)::int AS total,
             ${periodTotalsSelect('ia')}
      FROM item_agg ia
      WHERE ($8::boolean = FALSE OR NOT (ia.opening_qty = 0 AND ia.in_qty = 0 AND ia.out_qty = 0))
        ${filterWhere}
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
      brand: raw.brand ?? null,
      color: raw.color ?? null,
      size: raw.size ?? null,
      supplier: raw.supplier ?? null,
      transferOutQty: Number(raw.transfer_out_qty ?? 0),
      transferOutValue: Number(raw.transfer_out_value ?? 0),
      incomingQty: Number(raw.incoming_qty ?? 0),
      incomingValue: Number(raw.incoming_value ?? 0),
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
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  supplier?: string | null;
  transfer_out_qty?: string | number | null;
  transfer_out_value?: string | number | null;
  incoming_qty?: string | number | null;
  incoming_value?: string | number | null;
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
