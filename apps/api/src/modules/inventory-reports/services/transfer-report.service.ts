import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type ItemGroupBy } from './stock-period.service';

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
  itemGroupBy?: ItemGroupBy;
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
  brand?: string | null;
  color?: string | null;
  size?: string | null;
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
 * Báo cáo 6 + 7 — inter-branch transfer activity, from TWO independent
 * document sources (both must be unioned — neither alone is complete):
 *
 *   1. `stock_transfers` + `stock_transfer_lines` — the legacy single-phase
 *      flow (DRAFT → APPROVED → POSTED). POSTED moves both legs atomically.
 *      This table ALSO holds intra-branch (same source/destination branch)
 *      inter-warehouse moves — those are deliberately excluded here since
 *      this report is about flow *between* branches, not within one.
 *   2. `goods_issues` (purpose = TRANSFER_OUT) + `goods_receipts`
 *      (purpose = TRANSFER_IN) — the two-phase `transfer_orders` flow
 *      (DRAFT → IN_PROGRESS after source exports → COMPLETED only once the
 *      destination branch posts its own GoodsReceipt). `transfer_orders`
 *      itself is never queried directly: it doesn't carry actual
 *      shipped/received qty (only `requested_qty`), and never links back to
 *      `stock_transfers` (`executed_transfer_id` stays null for this flow).
 *      Critically, the IN leg only exists once the destination has ACTUALLY
 *      posted its GoodsReceipt — so a branch that hasn't confirmed receipt
 *      yet correctly shows zero incoming, unlike reading `transfer_orders`
 *      by itself would.
 *
 * "value" reflects the cost basis at transfer time — `items.purchase_price`
 * for the legacy flow (no per-line price stored), the line's own
 * `unit_price` for the two-phase flow (real transaction price is captured).
 *
 * Filter is `status = 'POSTED'` + `posted_at IN [startDate, endDate)` on
 * whichever document represents that leg (the transfer, the GoodsIssue, or
 * the GoodsReceipt) — not `transfer_orders.created_at`.
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

    // Per-branch IN/OUT/RECEIVED aggregates from posted inter-branch
    // transfers in the period, unioned across both document sources (see
    // class doc comment). `source_branch_id <> destination_branch_id` /
    // `branch_id <> target_branch_id` / `branch_id <> source_branch_id`
    // excludes intra-branch inter-warehouse moves from this cross-branch
    // report.
    //
    // `received_qty`/`received_value` are attributed to the SHIPMENT'S
    // SOURCE branch (not the receiving branch) — they answer "of what THIS
    // branch shipped out, how much have the destinations confirmed as
    // received", which is a different question from `in_qty` ("how much did
    // THIS branch itself receive from others"). For the legacy flow POSTED
    // is atomic so received always equals out (diff = 0, always healthy).
    // For the two-phase flow, received is only counted once the destination
    // has actually posted its GoodsReceipt — a shipment still in transit
    // (GoodsIssue posted, no GoodsReceipt yet) correctly leaves the source
    // branch's diff negative (shipped, not yet confirmed received).
    const sql = `
      WITH movements AS (
        SELECT
          st.source_branch_id::text AS branch_id,
          0::numeric AS in_qty, 0::numeric AS in_value,
          stl.quantity::numeric AS out_qty,
          (stl.quantity::numeric * COALESCE(i.purchase_price, 0)) AS out_value,
          0::numeric AS received_qty, 0::numeric AS received_value
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
          AND st.source_branch_id <> st.destination_branch_id

        UNION ALL

        SELECT
          st.destination_branch_id::text AS branch_id,
          stl.quantity::numeric AS in_qty,
          (stl.quantity::numeric * COALESCE(i.purchase_price, 0)) AS in_value,
          0::numeric AS out_qty, 0::numeric AS out_value,
          0::numeric AS received_qty, 0::numeric AS received_value
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
          AND st.source_branch_id <> st.destination_branch_id

        UNION ALL

        SELECT
          st.source_branch_id::text AS branch_id,
          0::numeric AS in_qty, 0::numeric AS in_value,
          0::numeric AS out_qty, 0::numeric AS out_value,
          stl.quantity::numeric AS received_qty,
          (stl.quantity::numeric * COALESCE(i.purchase_price, 0)) AS received_value
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
          AND st.source_branch_id <> st.destination_branch_id

        UNION ALL

        SELECT
          gi.branch_id AS branch_id,
          0::numeric AS in_qty, 0::numeric AS in_value,
          gil.quantity::numeric AS out_qty,
          (gil.quantity::numeric * gil.unit_price::numeric) AS out_value,
          0::numeric AS received_qty, 0::numeric AS received_value
        FROM goods_issues gi
        JOIN goods_issue_lines gil ON gil.goods_issue_id = gi.id
        WHERE gi.organization_id = $1
          AND gi.status = 'POSTED'
          AND gi.purpose = 'TRANSFER_OUT'
          AND gi.posted_at >= $2 AND gi.posted_at < $3
          AND gi.target_branch_id IS NOT NULL
          AND gi.branch_id <> gi.target_branch_id::text

        UNION ALL

        SELECT
          gr.branch_id AS branch_id,
          grl.quantity::numeric AS in_qty,
          (grl.quantity::numeric * grl.unit_price::numeric) AS in_value,
          0::numeric AS out_qty, 0::numeric AS out_value,
          0::numeric AS received_qty, 0::numeric AS received_value
        FROM goods_receipts gr
        JOIN goods_receipt_lines grl ON grl.goods_receipt_id = gr.id
        WHERE gr.organization_id = $1
          AND gr.status = 'POSTED'
          AND gr.purpose = 'TRANSFER_IN'
          AND gr.posted_at >= $2 AND gr.posted_at < $3
          AND gr.source_branch_id IS NOT NULL
          AND gr.branch_id <> gr.source_branch_id

        UNION ALL

        SELECT
          gr.source_branch_id AS branch_id,
          0::numeric AS in_qty, 0::numeric AS in_value,
          0::numeric AS out_qty, 0::numeric AS out_value,
          grl.quantity::numeric AS received_qty,
          (grl.quantity::numeric * grl.unit_price::numeric) AS received_value
        FROM goods_receipts gr
        JOIN goods_receipt_lines grl ON grl.goods_receipt_id = gr.id
        WHERE gr.organization_id = $1
          AND gr.status = 'POSTED'
          AND gr.purpose = 'TRANSFER_IN'
          AND gr.posted_at >= $2 AND gr.posted_at < $3
          AND gr.source_branch_id IS NOT NULL
          AND gr.branch_id <> gr.source_branch_id
      )
      SELECT
        b.id AS branch_id,
        b.name AS branch_name,
        COALESCE(SUM(m.in_qty), 0) AS in_qty,
        COALESCE(SUM(m.in_value), 0) AS in_value,
        COALESCE(SUM(m.out_qty), 0) AS out_qty,
        COALESCE(SUM(m.out_value), 0) AS out_value,
        COALESCE(SUM(m.received_qty), 0) AS received_qty,
        COALESCE(SUM(m.received_value), 0) AS received_value
      FROM movements m
      JOIN branches b ON b.id::text = m.branch_id AND b.organization_id = $1
      WHERE ($4::uuid[] IS NULL OR b.id = ANY($4))
      GROUP BY b.id, b.name
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
      // qtyReceived is attributed to THIS branch as shipment source (see SQL
      // comment) — 0 in a healthy ledger means every unit shipped out has
      // been confirmed received at its destination.
      const qtyReceived = Number(r.received_qty ?? 0);
      const valueReceived = Number(r.received_value ?? 0);
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
      query.destinationBranchIds?.length ? query.destinationBranchIds : null;
    const categoryIds = query.categoryIds?.length ? query.categoryIds : null;
    const search = query.search?.trim().length ? query.search.trim() : null;
    const itemGroupBy: ItemGroupBy = query.itemGroupBy ?? 'item';

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const offset = (page - 1) * pageSize;

    // Base CTEs — always aggregate at item level first. Each leg unions the
    // legacy `stock_transfers` flow with the two-phase `transfer_orders`
    // flow (via its GoodsIssue/GoodsReceipt documents) then re-aggregates,
    // since the same (item, other_branch) pair could otherwise appear once
    // per source and break the `combined` CTE's join uniqueness. Both
    // exclude intra-branch moves (source = destination) — see the class doc
    // comment on why `transfer_orders` itself is never queried directly.
    // Parameters:
    //   $1 orgId  $2 startDate  $3 endDate  $4 sourceBranchId
    //   $5 destinationBranchIds  $6 categoryIds  $7 search
    const baseCtes = `
      out_leg AS (
        SELECT item_id, other_branch_id, SUM(qty) AS qty, SUM(value) AS value
        FROM (
          SELECT
            stl.item_id,
            st.destination_branch_id AS other_branch_id,
            stl.quantity AS qty,
            stl.quantity * COALESCE(i.purchase_price, 0) AS value
          FROM stock_transfers st
          JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
          JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
          WHERE st.organization_id = $1
            AND st.status = 'POSTED'
            AND st.posted_at >= $2 AND st.posted_at < $3
            AND st.source_branch_id = $4
            AND st.source_branch_id <> st.destination_branch_id
            AND ($5::uuid[] IS NULL OR st.destination_branch_id = ANY($5))

          UNION ALL

          SELECT
            gil.item_id,
            gi.target_branch_id AS other_branch_id,
            gil.quantity AS qty,
            gil.quantity * gil.unit_price AS value
          FROM goods_issues gi
          JOIN goods_issue_lines gil ON gil.goods_issue_id = gi.id
          WHERE gi.organization_id = $1
            AND gi.status = 'POSTED'
            AND gi.purpose = 'TRANSFER_OUT'
            AND gi.posted_at >= $2 AND gi.posted_at < $3
            AND gi.branch_id = $4::text
            AND gi.target_branch_id IS NOT NULL
            AND gi.branch_id <> gi.target_branch_id::text
            AND ($5::uuid[] IS NULL OR gi.target_branch_id = ANY($5))
        ) combined_out
        GROUP BY item_id, other_branch_id
      ),
      in_leg AS (
        SELECT item_id, other_branch_id, SUM(qty) AS qty, SUM(value) AS value
        FROM (
          SELECT
            stl.item_id,
            st.source_branch_id AS other_branch_id,
            stl.quantity AS qty,
            stl.quantity * COALESCE(i.purchase_price, 0) AS value
          FROM stock_transfers st
          JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
          JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
          WHERE st.organization_id = $1
            AND st.status = 'POSTED'
            AND st.posted_at >= $2 AND st.posted_at < $3
            AND st.destination_branch_id = $4
            AND st.source_branch_id <> st.destination_branch_id
            AND ($5::uuid[] IS NULL OR st.source_branch_id = ANY($5))

          UNION ALL

          SELECT
            grl.item_id,
            gr.source_branch_id::uuid AS other_branch_id,
            grl.quantity AS qty,
            grl.quantity * grl.unit_price AS value
          FROM goods_receipts gr
          JOIN goods_receipt_lines grl ON grl.goods_receipt_id = gr.id
          WHERE gr.organization_id = $1
            AND gr.status = 'POSTED'
            AND gr.purpose = 'TRANSFER_IN'
            AND gr.posted_at >= $2 AND gr.posted_at < $3
            AND gr.branch_id = $4::text
            AND gr.source_branch_id IS NOT NULL
            AND gr.branch_id <> gr.source_branch_id
            AND ($5::uuid[] IS NULL OR gr.source_branch_id::uuid = ANY($5))
        ) combined_in
        GROUP BY item_id, other_branch_id
      ),
      combined AS (
        SELECT
          COALESCE(o.item_id, ii.item_id)                       AS item_id,
          COALESCE(o.other_branch_id, ii.other_branch_id)       AS other_branch_id,
          COALESCE(o.qty, 0)   AS out_qty,
          COALESCE(o.value, 0) AS out_value,
          COALESCE(ii.qty, 0)  AS in_qty,
          COALESCE(ii.value, 0) AS in_value
        FROM out_leg o
        FULL OUTER JOIN in_leg ii
          ON o.item_id = ii.item_id AND o.other_branch_id = ii.other_branch_id
      )
    `;

    let dataSql: string;
    let countSql: string;

    if (itemGroupBy === 'item') {
      dataSql = `
        WITH ${baseCtes}
        SELECT
          i.id    AS item_id,
          i.code  AS sku,
          i.name  AS item_name,
          pr.code AS parent_sku,
          pr.name AS parent_name,

          i.unit  AS unit,
          ic.id   AS category_id,
          ic.name AS category_name,
          i.brand AS brand,
          (SELECT pao.value_label FROM item_attribute_values iav
           JOIN product_attribute_definitions pad ON pad.id = iav.attribute_definition_id
           JOIN product_attribute_options pao ON pao.id = iav.option_id
           WHERE iav.item_id = i.id AND LOWER(pad.name) IN ('màu sắc', 'màu', 'color')
           LIMIT 1) AS color,
          (SELECT pao.value_label FROM item_attribute_values iav
           JOIN product_attribute_definitions pad ON pad.id = iav.attribute_definition_id
           JOIN product_attribute_options pao ON pao.id = iav.option_id
           WHERE iav.item_id = i.id AND LOWER(pad.name) = 'size'
           LIMIT 1) AS size,
          b.id    AS dest_branch_id,
          b.name  AS dest_branch_name,
          c.out_qty, c.out_value, c.in_qty, c.in_value
        FROM combined c
        JOIN  items i  ON i.id = c.item_id AND i.organization_id = $1
        LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
        LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
        JOIN  branches b ON b.id = c.other_branch_id AND b.organization_id = $1
        WHERE ($6::uuid[] IS NULL OR i.category_id = ANY($6))
          AND ($7::text IS NULL OR i.code ILIKE '%' || $7 || '%' OR i.name ILIKE '%' || $7 || '%')
        ORDER BY i.code ASC, b.name ASC
        LIMIT $8 OFFSET $9
      `;
      countSql = `
        WITH ${baseCtes}
        SELECT COUNT(*)::int AS total
        FROM combined c
        JOIN items i ON i.id = c.item_id AND i.organization_id = $1
        WHERE ($6::uuid[] IS NULL OR i.category_id = ANY($6))
          AND ($7::text IS NULL OR i.code ILIKE '%' || $7 || '%' OR i.name ILIKE '%' || $7 || '%')
      `;
    } else {
      const aggKeyExpr = itemGroupBy === 'parent'
        ? `COALESCE(i.product_id::text, i.id::text)`
        : `i.category_id::text`;

      const aggCte = `
        item_agg AS (
          SELECT
            ${aggKeyExpr}              AS agg_key,
            c.other_branch_id,
            MIN(i.code)                AS fallback_sku,
            MIN(i.name)                AS fallback_name,
            SUM(c.out_qty)             AS out_qty,
            SUM(c.out_value)           AS out_value,
            SUM(c.in_qty)              AS in_qty,
            SUM(c.in_value)            AS in_value
          FROM combined c
          JOIN items i ON i.id = c.item_id AND i.organization_id = $1
          WHERE ($6::uuid[] IS NULL OR i.category_id = ANY($6))
            AND ($7::text IS NULL OR i.code ILIKE '%' || $7 || '%' OR i.name ILIKE '%' || $7 || '%')
          GROUP BY ${aggKeyExpr}, c.other_branch_id
        )
      `;

      const displayCols = itemGroupBy === 'parent'
        ? `
          ia.agg_key                            AS item_id,
          COALESCE(p.code, ia.fallback_sku)     AS sku,
          COALESCE(p.name, ia.fallback_name)    AS item_name,
          NULL::text AS parent_sku, NULL::text AS parent_name,
          NULL::text AS unit, NULL::uuid AS category_id, NULL::text AS category_name,
          NULL::text AS brand, NULL::text AS color, NULL::text AS size`
        : `
          ia.agg_key                                    AS item_id,
          COALESCE(ic.name, 'Không phân nhóm')          AS sku,
          COALESCE(ic.name, 'Không phân nhóm')          AS item_name,
          NULL::text AS parent_sku, NULL::text AS parent_name,
          NULL::text AS unit,
          ia.agg_key                                    AS category_id,
          COALESCE(ic.name, 'Không phân nhóm')          AS category_name,
          NULL::text AS brand, NULL::text AS color, NULL::text AS size`;

      const joinLookup = itemGroupBy === 'parent'
        ? `LEFT JOIN products p ON p.id::text = ia.agg_key AND p.organization_id = $1`
        : `LEFT JOIN inventory_item_categories ic ON ic.id::text = ia.agg_key`;

      const orderByCol = itemGroupBy === 'parent'
        ? `COALESCE(p.code, ia.fallback_sku)`
        : `COALESCE(ic.name, 'Không phân nhóm')`;

      dataSql = `
        WITH ${baseCtes},
        ${aggCte}
        SELECT
          ${displayCols},
          b.id   AS dest_branch_id,
          b.name AS dest_branch_name,
          ia.out_qty, ia.out_value, ia.in_qty, ia.in_value
        FROM item_agg ia
        ${joinLookup}
        JOIN branches b ON b.id = ia.other_branch_id AND b.organization_id = $1
        ORDER BY ${orderByCol} ASC NULLS LAST, b.name ASC
        LIMIT $8 OFFSET $9
      `;
      countSql = `
        WITH ${baseCtes},
        ${aggCte}
        SELECT COUNT(*)::int AS total FROM item_agg ia
      `;
    }

    const params: unknown[] = [
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

    const data: TransferByBranchRow[] = (rows as RawTransferByBranchRow[]).map((r) => {
      const outQty = Number(r.out_qty ?? 0);
      const outValue = Number(r.out_value ?? 0);
      const inQty = Number(r.in_qty ?? 0);
      const inValue = Number(r.in_value ?? 0);
      return {
        itemId: r.item_id,
        sku: r.sku ?? '',
        itemName: r.item_name ?? '',
        parentSku: r.parent_sku ?? null,
        parentName: r.parent_name ?? null,
        unit: r.unit ?? '',
        categoryId: r.category_id ?? null,
        categoryName: r.category_name ?? null,
        brand: r.brand ?? null,
        color: r.color ?? null,
        size: r.size ?? null,
        destinationBranchId: r.dest_branch_id,
        destinationBranchName: r.dest_branch_name ?? '',
        outQty,
        outValue,
        outAvgPrice: outQty > 0 ? outValue / outQty : 0,
        inQty,
        inValue,
        inAvgPrice: inQty > 0 ? inValue / inQty : 0,
      };
    });

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
  received_qty: string | number | null;
  received_value: string | number | null;
}

interface RawTransferByBranchRow {
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
  dest_branch_id: string;
  dest_branch_name: string | null;
  out_qty: string | number | null;
  out_value: string | number | null;
  in_qty: string | number | null;
  in_value: string | number | null;
}
