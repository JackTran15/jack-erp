import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

// ──────────────────────────────────────────────────────────────────
// Báo cáo 6 — Tổng hợp nhập xuất điều chuyển (per-branch totals)
// ──────────────────────────────────────────────────────────────────

export interface TransferSummaryQuery {
  organizationId: string;
  startDate: Date;
  endDate: Date;
  branchIds?: string[];
}

export interface TransferSummaryRow {
  branchId: string;
  /** `branches` table has no `code` column today — kept null for forward compat. */
  branchCode: string | null;
  branchName: string;
  /** Goods received from other branches (TRANSFER_IN signed positive in ledger). */
  qtyIn: number;
  valueIn: number;
  /** Goods shipped out to other branches (TRANSFER_OUT — stored as negative, surfaced as positive magnitude). */
  qtyOut: number;
  valueOut: number;
  /** Mirror metric: qty other branches actually received from this branch (= sum of TRANSFER_IN at destinations whose paired OUT originated here). */
  qtyReceived: number;
  valueReceived: number;
  /** qtyReceived - qtyOut: 0 in a healthy ledger; nonzero hints at in-transit / mismatch. */
  qtyDifference: number;
  valueDifference: number;
  /** qtyIn - qtyOut at this branch — net inflow/outflow. */
  qtyInOutDifference: number;
  valueInOutDifference: number;
}

export interface TransferSummaryResult {
  data: TransferSummaryRow[];
  total: number;
}

// ──────────────────────────────────────────────────────────────────
// Báo cáo 7 — Hàng hóa điều chuyển theo cửa hàng (per item × destination)
// ──────────────────────────────────────────────────────────────────

export interface TransferByBranchQuery {
  organizationId: string;
  startDate: Date;
  endDate: Date;
  /** Required — source branch whose outgoing transfers we tabulate. */
  sourceBranchId: string;
  /** Optional — restrict destinations to a subset (FE "target store" filter). */
  destinationBranchIds?: string[];
  categoryIds?: string[];
  search?: string;
  page: number;
  pageSize: number;
}

export interface TransferByBranchRow {
  itemId: string;
  sku: string;
  itemName: string;
  parentSku: string | null;
  parentName: string | null;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  destinationBranchId: string;
  destinationBranchName: string;
  outQty: number;
  outAvgPrice: number;
  outValue: number;
  inQty: number;
  inAvgPrice: number;
  inValue: number;
}

export interface TransferByBranchResult {
  data: TransferByBranchRow[];
  total: number;
}

/**
 * Báo cáo 6 + 7 — derived from `stock_transfers` + `stock_transfer_lines`.
 *
 * We deliberately read the transfer document tables (not the ledger) so
 * "value" reflects the cost basis at transfer time via `items.purchase_price`
 * — same convention the rest of inventory reports use when ledger
 * `line_value` isn't queried directly.
 *
 * Filter is `status = 'POSTED'` + `posted_at IN [startDate, endDate)`.
 */
@Injectable()
export class TransferReportService {
  constructor(private readonly dataSource: DataSource) {}

  // ──────────────────────────────────────────────────────────────────
  // Báo cáo 6
  // ──────────────────────────────────────────────────────────────────
  async summarize(query: TransferSummaryQuery): Promise<TransferSummaryResult> {
    const branchIds =
      query.branchIds && query.branchIds.length > 0 ? query.branchIds : null;

    // Per-branch IN/OUT aggregates from posted transfers in the period.
    //   OUT side  → source_branch_id contributes qty/value
    //   IN side   → destination_branch_id contributes qty/value
    // The `branches_in_scope` CTE bounds the result set to branches that
    // actually moved stock in the period (or that pass the filter).
    const sql = `
      WITH out_side AS (
        SELECT
          st.source_branch_id AS branch_id,
          SUM(stl.quantity) AS qty,
          SUM(stl.quantity * COALESCE(i.purchase_price, 0)) AS value
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
        GROUP BY st.source_branch_id
      ),
      in_side AS (
        SELECT
          st.destination_branch_id AS branch_id,
          SUM(stl.quantity) AS qty,
          SUM(stl.quantity * COALESCE(i.purchase_price, 0)) AS value
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
        GROUP BY st.destination_branch_id
      ),
      combined AS (
        SELECT
          COALESCE(o.branch_id, i.branch_id) AS branch_id,
          COALESCE(i.qty, 0) AS in_qty,
          COALESCE(i.value, 0) AS in_value,
          COALESCE(o.qty, 0) AS out_qty,
          COALESCE(o.value, 0) AS out_value
        FROM out_side o
        FULL OUTER JOIN in_side i ON o.branch_id = i.branch_id
      )
      SELECT
        b.id AS branch_id,
        b.name AS branch_name,
        c.in_qty,
        c.in_value,
        c.out_qty,
        c.out_value
      FROM combined c
      JOIN branches b ON b.id = c.branch_id AND b.organization_id = $1
      WHERE ($4::uuid[] IS NULL OR c.branch_id = ANY($4))
      ORDER BY b.name ASC
    `;

    const rows = (await this.dataSource.query(sql, [
      query.organizationId,
      query.startDate,
      query.endDate,
      branchIds,
    ])) as RawTransferSummaryRow[];

    const data: TransferSummaryRow[] = rows.map((r) => {
      const inQty = Number(r.in_qty ?? 0);
      const inValue = Number(r.in_value ?? 0);
      const outQty = Number(r.out_qty ?? 0);
      const outValue = Number(r.out_value ?? 0);
      // Healthy ledger: what we shipped out IS what destinations received.
      // We surface both as separate metrics; difference highlights mismatch.
      const qtyReceived = inQty;
      const valueReceived = inValue;
      return {
        branchId: r.branch_id,
        branchCode: null,
        branchName: r.branch_name ?? '',
        qtyIn: inQty,
        valueIn: inValue,
        qtyOut: outQty,
        valueOut: outValue,
        qtyReceived,
        valueReceived,
        qtyDifference: qtyReceived - outQty,
        valueDifference: valueReceived - outValue,
        qtyInOutDifference: inQty - outQty,
        valueInOutDifference: inValue - outValue,
      };
    });

    return { data, total: data.length };
  }

  // ──────────────────────────────────────────────────────────────────
  // Báo cáo 7
  // ──────────────────────────────────────────────────────────────────
  async byBranch(query: TransferByBranchQuery): Promise<TransferByBranchResult> {
    const destinationBranchIds =
      query.destinationBranchIds && query.destinationBranchIds.length > 0
        ? query.destinationBranchIds
        : null;
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

    // OUT leg: sourceBranchId is the user's source filter.
    // IN leg (mirror): also include reverse transfers where the OTHER
    //   branch shipped TO sourceBranchId — so the report can show
    //   "things this branch received" too. The FE schema has both inQty
    //   and outQty so we surface both directions, grouped by the "other"
    //   branch (= destination for OUT rows, = source for IN rows).
    const dataSql = `
      WITH out_leg AS (
        SELECT
          stl.item_id,
          st.destination_branch_id AS other_branch_id,
          SUM(stl.quantity) AS qty,
          SUM(stl.quantity * COALESCE(i.purchase_price, 0)) AS value
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
          AND st.source_branch_id = $4
          AND ($5::uuid[] IS NULL OR st.destination_branch_id = ANY($5))
        GROUP BY stl.item_id, st.destination_branch_id
      ),
      in_leg AS (
        SELECT
          stl.item_id,
          st.source_branch_id AS other_branch_id,
          SUM(stl.quantity) AS qty,
          SUM(stl.quantity * COALESCE(i.purchase_price, 0)) AS value
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
          AND st.destination_branch_id = $4
          AND ($5::uuid[] IS NULL OR st.source_branch_id = ANY($5))
        GROUP BY stl.item_id, st.source_branch_id
      ),
      combined AS (
        SELECT
          COALESCE(o.item_id, ii.item_id) AS item_id,
          COALESCE(o.other_branch_id, ii.other_branch_id) AS other_branch_id,
          COALESCE(o.qty, 0) AS out_qty,
          COALESCE(o.value, 0) AS out_value,
          COALESCE(ii.qty, 0) AS in_qty,
          COALESCE(ii.value, 0) AS in_value
        FROM out_leg o
        FULL OUTER JOIN in_leg ii
          ON o.item_id = ii.item_id AND o.other_branch_id = ii.other_branch_id
      )
      SELECT
        i.id AS item_id,
        i.code AS sku,
        i.name AS item_name,
        pr.name AS parent_name,
        i.unit AS unit,
        ic.id AS category_id,
        ic.name AS category_name,
        b.id AS dest_branch_id,
        b.name AS dest_branch_name,
        c.out_qty,
        c.out_value,
        c.in_qty,
        c.in_value
      FROM combined c
      JOIN items i ON i.id = c.item_id AND i.organization_id = $1
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      JOIN branches b ON b.id = c.other_branch_id AND b.organization_id = $1
      WHERE ($6::uuid[] IS NULL OR i.category_id = ANY($6))
        AND ($7::text IS NULL OR i.code ILIKE '%' || $7 || '%' OR i.name ILIKE '%' || $7 || '%')
      ORDER BY i.code ASC, b.name ASC
      LIMIT $8 OFFSET $9
    `;

    const countSql = `
      WITH out_leg AS (
        SELECT
          stl.item_id,
          st.destination_branch_id AS other_branch_id
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
          AND st.source_branch_id = $4
          AND ($5::uuid[] IS NULL OR st.destination_branch_id = ANY($5))
        GROUP BY stl.item_id, st.destination_branch_id
      ),
      in_leg AS (
        SELECT
          stl.item_id,
          st.source_branch_id AS other_branch_id
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
          AND st.destination_branch_id = $4
          AND ($5::uuid[] IS NULL OR st.source_branch_id = ANY($5))
        GROUP BY stl.item_id, st.source_branch_id
      ),
      combined AS (
        SELECT
          COALESCE(o.item_id, ii.item_id) AS item_id,
          COALESCE(o.other_branch_id, ii.other_branch_id) AS other_branch_id
        FROM out_leg o
        FULL OUTER JOIN in_leg ii
          ON o.item_id = ii.item_id AND o.other_branch_id = ii.other_branch_id
      )
      SELECT COUNT(*)::int AS total
      FROM combined c
      JOIN items i ON i.id = c.item_id AND i.organization_id = $1
      WHERE ($6::uuid[] IS NULL OR i.category_id = ANY($6))
        AND ($7::text IS NULL OR i.code ILIKE '%' || $7 || '%' OR i.name ILIKE '%' || $7 || '%')
    `;

    const params = [
      query.organizationId,
      query.startDate,
      query.endDate,
      query.sourceBranchId,
      destinationBranchIds,
      categoryIds,
      search,
    ];

    const [rows, countRows] = await Promise.all([
      this.dataSource.query(dataSql, [...params, pageSize, offset]),
      this.dataSource.query(countSql, params),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    const data: TransferByBranchRow[] = (rows as RawTransferByBranchRow[]).map(
      (r) => {
        const outQty = Number(r.out_qty ?? 0);
        const outValue = Number(r.out_value ?? 0);
        const inQty = Number(r.in_qty ?? 0);
        const inValue = Number(r.in_value ?? 0);
        return {
          itemId: r.item_id,
          sku: r.sku,
          itemName: r.item_name,
          parentSku: r.parent_name ?? null,
          parentName: r.parent_name ?? null,
          unit: r.unit ?? '',
          categoryId: r.category_id ?? null,
          categoryName: r.category_name ?? null,
          destinationBranchId: r.dest_branch_id,
          destinationBranchName: r.dest_branch_name ?? '',
          outQty,
          outValue,
          outAvgPrice: outQty > 0 ? outValue / outQty : 0,
          inQty,
          inValue,
          inAvgPrice: inQty > 0 ? inValue / inQty : 0,
        };
      },
    );

    return { data, total };
  }
}

interface RawTransferSummaryRow {
  branch_id: string;
  branch_name: string | null;
  in_qty: string | number | null;
  in_value: string | number | null;
  out_qty: string | number | null;
  out_value: string | number | null;
}

interface RawTransferByBranchRow {
  item_id: string;
  sku: string;
  item_name: string;
  parent_name: string | null;
  unit: string | null;
  category_id: string | null;
  category_name: string | null;
  dest_branch_id: string;
  dest_branch_name: string | null;
  out_qty: string | number | null;
  out_value: string | number | null;
  in_qty: string | number | null;
  in_value: string | number | null;
}
