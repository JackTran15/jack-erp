import { Injectable } from '@nestjs/common';
import { INVENTORY_DOC_KIND_LABELS_VI, type ReportTotals } from '@erp/shared-interfaces';
import {
  buildReportColumnFilter,
  type ReportColumnFilters,
  type ReportColumnSpecs,
} from './report-column-filter.util';
import { DataSource } from 'typeorm';

/**
 * Báo cáo 2 — Bảng kê chi tiết phiếu nhập xuất kho.
 *
 * Each row in the report = one document line, sourced from the 3 posted
 * document streams (UNION ALL):
 *   1. `goods_receipts` + `goods_receipt_lines`  → IN-side rows (Phiếu nhập)
 *   2. `goods_issues`   + `goods_issue_lines`    → OUT-side rows (Phiếu xuất)
 *   3. `stock_transfers` + `stock_transfer_lines` → OUT-side rows from source branch
 *
 * Filter: `status = 'POSTED'` + `posted_at IN [startDate, endDate)`.
 *
 * Cost basis:
 *   - GR: uses the line's own `unit_price` (purchase price at receipt).
 *   - GI: uses the line's own `unit_price` (issue/cost price).
 *   - ST: falls back to `items.purchase_price` (no per-line price stored).
 *
 * Known divergences from initial spec (documented for future enrichment):
 *   - `goods_receipts` has `reference_id` (UUID) — no `reference_number`
 *     column. We pass it through as text so the FE has *something* to
 *     show; resolving the PO/invoice number is Phase 2.
 *   - `goods_issue_lines` has no `location_id` — we use the header
 *     `goods_issues.location_id` instead.
 *   - `stock_transfer_lines.source_location_id` is nullable on legacy
 *     rows; falls back to the header `source_location_id` via COALESCE.
 *   - `branches` table has no `code` column (mirrors how
 *     `transfer-report.service.ts` returns `branchCode: null`).
 *
 * "Đối tượng" (customer_name) — resolved from `counterparty_kind` +
 * `counterparty_id` on goods_receipts/goods_issues (supplier → providers,
 * customer → customers, employee → users), falling back to the legacy
 * `provider_id` FK for rows written before that column existed. Mirrors
 * `counterparty-name.util.ts`'s CASE shape. Stock transfers have no
 * external counterparty (inter-branch) — stays NULL.
 *
 * "Giá bán" (in/out sale price) — no per-line selling price is captured at
 * document time (goods_receipt_lines / goods_issue_lines only store the
 * cost `unit_price`); we surface `items.selling_price` (the item's current
 * catalog price) on whichever band matches the row's movement direction.
 */

export interface DocumentDetailRow {
  docKind: 'GOODS_RECEIPT' | 'GOODS_ISSUE' | 'STOCK_TRANSFER';
  postedAt: Date;
  documentNumber: string;
  referenceNumber: string | null;
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
  branchId: string | null;
  branchName: string | null;
  receiverBranchId: string | null;
  receiverBranchName: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  inQty: number;
  inUnitPrice: number;
  inValue: number;
  inSalePrice: number | null;
  outQty: number;
  outUnitPrice: number;
  outValue: number;
  outSalePrice: number | null;
  customerName: string | null;
  notes: string | null;
}

export interface DocumentDetailQuery {
  organizationId: string;
  startDate: Date;
  endDate: Date;
  branchIds?: string[];
  categoryIds?: string[];
  search?: string;
  page: number;
  pageSize: number;
  /**
   * Keyset cursor for export (ADR-07). Present means: continue after this row,
   * skip the COUNT, and ignore `page` — OFFSET on a three-way UNION gets slower
   * with every page and shifts rows under concurrent postings.
   */
  cursor?: DocumentDetailCursor | null;
  /** Start a keyset walk at the first page. Implied when `cursor` is set. */
  keyset?: boolean;
  /** Lọc theo cột, áp phía server nên tác dụng trên toàn tập. */
  columnFilters?: ReportColumnFilters;
}

/**
 * `(posted_at, docKind:lineId)`. The union has no single id column, so the row
 * key is the stream name plus the line id — unique, and stable to sort on.
 */
export interface DocumentDetailCursor {
  at: string;
  id: string;
}

export interface DocumentDetailResult {
  data: DocumentDetailRow[];
  /** Row count for the period; 0 in keyset mode, which runs no COUNT. */
  total: number;
  nextCursor: DocumentDetailCursor | null;
  hasMore: boolean;
  /**
   * SUM của các cột số trên toàn bộ kết quả lọc. Rỗng ở chế độ keyset — đường
   * đó không chạy COUNT nên cũng không có tổng để bám vào; nó phục vụ xuất
   * khẩu, nơi không có footer.
   */
  totals: ReportTotals;
}

/** Cột lọc được, chiếu ở tầng ngoài (`lines l` + `items i`). */
/**
 * The counterparty name, resolved from whichever table the line points at.
 *
 * One definition, used by the SELECT list and by the `customer` filter spec, so
 * a user filtering the column matches exactly what the column shows.
 */
const COUNTERPARTY_SQL = `(CASE
           WHEN l.counterparty_kind = 'supplier' THEN
             (SELECT p.name FROM inventory_providers p WHERE p.id::text = l.counterparty_id AND p.organization_id = $1)
           WHEN l.counterparty_kind = 'customer' THEN
             (SELECT c.name FROM customers c WHERE c.id::text = l.counterparty_id AND c.organization_id = $1)
           WHEN l.counterparty_kind = 'employee' THEN
             (SELECT (u.first_name || ' ' || u.last_name) FROM users u WHERE u.id::text = l.counterparty_id AND u.organization_id = $1::uuid)
           WHEN l.provider_id IS NOT NULL THEN
             (SELECT p2.name FROM inventory_providers p2 WHERE p2.id::text = l.provider_id AND p2.organization_id = $1)
           ELSE NULL
         END)`;

/**
 * `doc_kind` → the Vietnamese label the grid renders, built from the shared
 * constant so the two cannot drift. Filtering "Phiếu điều chuyển kho" has to
 * match the cell showing that text, not the enum behind it.
 */
const DOC_KIND_LABEL_SQL = `(CASE ${Object.entries(INVENTORY_DOC_KIND_LABELS_VI)
  .map(([kind, label]) => `WHEN l.doc_kind = '${kind}' THEN '${label.replace(/'/g, "''")}'`)
  .join(' ')} ELSE l.doc_kind END)`;

/**
 * The joins the outer-stage specs resolve against.
 *
 * `dataSql` has always carried these; `countSql` joined only `items`. Both take
 * the same filter fragment, so a spec naming `ic.name` or `bs.name` breaks the
 * count with 42P01 unless the join lands in both (ADR-04). All are many-to-one,
 * so the row count is unchanged.
 */
const OUTER_JOINS = `
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      LEFT JOIN branches bs ON bs.id::text = l.branch_id AND bs.organization_id = $1
      LEFT JOIN branches br ON br.id::text = l.receiver_branch_id AND br.organization_id = $1
      LEFT JOIN locations loc ON loc.id = l.location_id`;

/** One definition each, so the predicate and the rendered cell cannot drift. */
const DOC_COLOR_SQL = `(SELECT pao.value_label FROM item_attribute_values iav
         JOIN product_attribute_definitions pad ON pad.id = iav.attribute_definition_id
         JOIN product_attribute_options pao ON pao.id = iav.option_id
         WHERE iav.item_id = i.id AND LOWER(pad.name) IN ('màu sắc', 'màu', 'color')
         LIMIT 1)`;

const DOC_SIZE_SQL = `(SELECT pao.value_label FROM item_attribute_values iav
         JOIN product_attribute_definitions pad ON pad.id = iav.attribute_definition_id
         JOIN product_attribute_options pao ON pao.id = iav.option_id
         WHERE iav.item_id = i.id AND LOWER(pad.name) = 'size'
         LIMIT 1)`;

const DOCUMENT_DETAIL_COLUMN_SPECS: ReportColumnSpecs = {
  color: { sql: DOC_COLOR_SQL, kind: 'text' },
  size: { sql: DOC_SIZE_SQL, kind: 'text' },
  // The grid renders this column as dd/MM/yyyy text with a TEXT filter box, so
  // the predicate matches the displayed form. Range mode still compares those
  // strings lexicographically, which is as wrong as it was before this change —
  // preserved deliberately rather than silently redefined here.
  date: { sql: `to_char(l.posted_at, 'DD/MM/YYYY')`, kind: 'text' },
  documentType: { sql: DOC_KIND_LABEL_SQL, kind: 'text' },
  warehouse: { sql: 'COALESCE(loc.name, bs.name)', kind: 'text' },
  notes: { sql: 'l.notes', kind: 'text' },
  customer: { sql: COUNTERPARTY_SQL, kind: 'text' },
  branchName: { sql: 'bs.name', kind: 'text' },
  // Only stock transfers carry a receiver, so the other two streams select NULL
  // for it. A predicate here therefore drops receipts and issues — which is what
  // filtering on "chi nhánh nhận" means, not a bug.
  receiverBranchName: { sql: 'br.name', kind: 'text' },
  // branchCode / receiverBranchCode get no spec: `toRow` hard-codes both to
  // null because `branches` has no code column. Filtering a column that can
  // only ever be null answers 400 instead of looking active and matching
  // nothing.
  group: { sql: 'ic.name', kind: 'text' },
  parentSku: { sql: 'pr.code', kind: 'text' },
  parentName: { sql: 'pr.name', kind: 'text' },
  inSalePrice: {
    sql: `(CASE WHEN l.doc_kind = 'GOODS_RECEIPT' THEN i.selling_price ELSE 0 END)`,
    kind: 'number',
  },
  outSalePrice: {
    sql: `(CASE WHEN l.doc_kind <> 'GOODS_RECEIPT' THEN i.selling_price ELSE 0 END)`,
    kind: 'number',
  },
  documentNumber: { sql: 'l.document_number', kind: 'text' },
  referenceNumber: { sql: 'l.reference_number', kind: 'text' },
  sku: { sql: 'i.code', kind: 'text' },
  itemName: { sql: 'i.name', kind: 'text' },
  unit: { sql: 'i.unit', kind: 'text' },
  brand: { sql: 'i.brand', kind: 'text' },
  inQty: { sql: 'l.in_qty', kind: 'number' },
  inUnitPrice: { sql: 'l.in_unit_price', kind: 'number' },
  inValue: { sql: 'l.in_value', kind: 'number' },
  outQty: { sql: 'l.out_qty', kind: 'number' },
  outUnitPrice: { sql: 'l.out_unit_price', kind: 'number' },
  outValue: { sql: 'l.out_value', kind: 'number' },
};

const DOCUMENT_DETAIL_TOTAL_COLUMNS = [
  ['inQty', 'in_qty'],
  ['inValue', 'in_value'],
  ['outQty', 'out_qty'],
  ['outValue', 'out_value'],
] as const;

@Injectable()
export class DocumentDetailService {
  constructor(private readonly dataSource: DataSource) {}

  async list(query: DocumentDetailQuery): Promise<DocumentDetailResult> {
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
    const keyset = query.keyset === true || query.cursor != null;
    const sharedParams = [
      query.organizationId,
      query.startDate,
      query.endDate,
      branchIds,
      categoryIds,
      search,
    ];
    // One fragment, spliced into the rows query and the count+totals query.
    const columnFilter = buildReportColumnFilter(
      query.columnFilters,
      DOCUMENT_DETAIL_COLUMN_SPECS,
      sharedParams.length,
    );
    const filterWhere = columnFilter.where ? `AND ${columnFilter.where}` : '';
    const filteredParams = [...sharedParams, ...columnFilter.params];
    const limitIndex = filteredParams.length + 1;
    // Compare on the same expression the ORDER BY uses, so the walk cannot
    // straddle two rows that share a posted_at.
    // Cursor parameters sit after pageSize, which now sits after the column
    // filter's parameters — hardcoding $8/$9 would silently read the wrong bind
    // the moment a filter is active.
    const keysetPredicate = query.cursor
      ? `AND (l.posted_at < CAST($${limitIndex + 1} AS timestamptz)
             OR (l.posted_at = CAST($${limitIndex + 1} AS timestamptz)
                 AND (l.doc_kind || ':' || l.line_id) < $${limitIndex + 2}))`
      : '';

    // ──────────────────────────────────────────────────────────────────
    // UNION ALL of the 3 source streams. Each branch projects the same
    // column set (NULLs where a field doesn't apply) so the outer query
    // can join uniformly to `items` / `branches` / `locations`.
    // ──────────────────────────────────────────────────────────────────
    const linesCte = `
      WITH lines AS (
        -- 1) Goods receipts (Nhập kho)
        SELECT
          'GOODS_RECEIPT'::text AS doc_kind,
          grl.id::text AS line_id,
          gr.posted_at AS posted_at,
          gr.document_number AS document_number,
          gr.reference_id::text AS reference_number,
          gr.branch_id::text AS branch_id,
          NULL::text AS receiver_branch_id,
          grl.item_id AS item_id,
          grl.location_id AS location_id,
          grl.quantity::numeric AS in_qty,
          grl.unit_price::numeric AS in_unit_price,
          (grl.quantity::numeric * grl.unit_price::numeric) AS in_value,
          0::numeric AS out_qty,
          0::numeric AS out_unit_price,
          0::numeric AS out_value,
          gr.counterparty_kind::text AS counterparty_kind,
          gr.counterparty_id::text AS counterparty_id,
          gr.provider_id::text AS provider_id,
          grl.note AS notes
        FROM goods_receipts gr
        JOIN goods_receipt_lines grl ON grl.goods_receipt_id = gr.id
        WHERE gr.organization_id = $1
          AND gr.status = 'POSTED'
          AND gr.posted_at >= $2 AND gr.posted_at < $3
          AND ($4::text[] IS NULL OR gr.branch_id = ANY($4::text[]))

        UNION ALL

        -- 2) Goods issues (Xuất kho)
        SELECT
          'GOODS_ISSUE'::text AS doc_kind,
          gil.id::text AS line_id,
          gi.posted_at,
          gi.document_number,
          NULL::text AS reference_number,
          gi.branch_id::text AS branch_id,
          gi.target_branch_id::text AS receiver_branch_id,
          gil.item_id,
          gi.location_id AS location_id,
          0::numeric AS in_qty,
          0::numeric AS in_unit_price,
          0::numeric AS in_value,
          gil.quantity::numeric AS out_qty,
          gil.unit_price::numeric AS out_unit_price,
          (gil.quantity::numeric * gil.unit_price::numeric) AS out_value,
          gi.counterparty_kind::text AS counterparty_kind,
          gi.counterparty_id::text AS counterparty_id,
          gi.provider_id::text AS provider_id,
          gil.notes
        FROM goods_issues gi
        JOIN goods_issue_lines gil ON gil.goods_issue_id = gi.id
        WHERE gi.organization_id = $1
          AND gi.status = 'POSTED'
          AND gi.posted_at >= $2 AND gi.posted_at < $3
          AND ($4::text[] IS NULL OR gi.branch_id = ANY($4::text[]))

        UNION ALL

        -- 3) Stock transfers (Điều chuyển) — OUT-side from source branch
        SELECT
          'STOCK_TRANSFER'::text AS doc_kind,
          stl.id::text AS line_id,
          st.posted_at,
          st.document_number,
          NULL::text AS reference_number,
          st.source_branch_id::text AS branch_id,
          st.destination_branch_id::text AS receiver_branch_id,
          stl.item_id,
          COALESCE(stl.source_location_id, st.source_location_id) AS location_id,
          0::numeric AS in_qty,
          0::numeric AS in_unit_price,
          0::numeric AS in_value,
          stl.quantity::numeric AS out_qty,
          COALESCE(i_st.purchase_price, 0)::numeric AS out_unit_price,
          (stl.quantity::numeric * COALESCE(i_st.purchase_price, 0)::numeric) AS out_value,
          NULL::text AS counterparty_kind,
          NULL::text AS counterparty_id,
          NULL::text AS provider_id,
          stl.notes
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        JOIN items i_st ON i_st.id = stl.item_id AND i_st.organization_id = st.organization_id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
          AND ($4::text[] IS NULL OR st.source_branch_id::text = ANY($4::text[]))
      )
    `;

    // ──────────────────────────────────────────────────────────────────
    // Final SELECT — joins items + categories + branches + locations.
    // Applies the item-level filters (category, search) here so they
    // run *after* the union and benefit from joined `items` data.
    // ──────────────────────────────────────────────────────────────────
    const dataSql = `
      ${linesCte}
      SELECT
        l.doc_kind,
        l.posted_at,
        l.document_number,
        l.reference_number,
        i.id AS item_id,
        i.code AS sku,
        i.name AS item_name,
        pr.name AS parent_name,
        i.unit AS unit,
        ic.id AS category_id,
        ic.name AS category_name,
        i.brand AS brand,
        ${DOC_COLOR_SQL} AS color,
        ${DOC_SIZE_SQL} AS size,
        bs.id AS branch_id,
        bs.name AS branch_name,
        br.id AS receiver_branch_id,
        br.name AS receiver_branch_name,
        loc.id AS location_id,
        loc.code AS location_code,
        loc.name AS location_name,
        l.in_qty,
        l.in_unit_price,
        l.in_value,
        (CASE WHEN l.doc_kind = 'GOODS_RECEIPT' THEN i.selling_price ELSE 0 END) AS in_sale_price,
        l.out_qty,
        l.out_unit_price,
        l.out_value,
        (CASE WHEN l.doc_kind <> 'GOODS_RECEIPT' THEN i.selling_price ELSE 0 END) AS out_sale_price,
        ${COUNTERPARTY_SQL} AS customer_name,
        l.notes,
        l.posted_at::text AS cursor_at,
        (l.doc_kind || ':' || l.line_id) AS cursor_id
      FROM lines l
      JOIN items i ON i.id = l.item_id AND i.organization_id = $1
      ${OUTER_JOINS}
      WHERE ($5::uuid[] IS NULL OR i.category_id = ANY($5))
        AND ($6::text IS NULL OR i.code ILIKE '%' || $6 || '%' OR i.name ILIKE '%' || $6 || '%')
        ${filterWhere}
      ${keyset ? keysetPredicate : ''}
      ORDER BY ${keyset ? 'l.posted_at DESC, cursor_id DESC' : 'l.posted_at DESC, l.document_number ASC'}
      ${keyset ? `LIMIT $${limitIndex}` : `LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`}
    `;

    // Count and totals in one pass over exactly the rows the grid will show.
    const countSql = `
      ${linesCte}
      SELECT COUNT(*)::int AS total,
             ${DOCUMENT_DETAIL_TOTAL_COLUMNS.map(
               ([, col]) => `COALESCE(SUM(l.${col}), 0)::numeric AS ${col}`,
             ).join(',\n             ')}
      FROM lines l
      JOIN items i ON i.id = l.item_id AND i.organization_id = $1
      ${OUTER_JOINS}
      WHERE ($5::uuid[] IS NULL OR i.category_id = ANY($5))
        AND ($6::text IS NULL OR i.code ILIKE '%' || $6 || '%' OR i.name ILIKE '%' || $6 || '%')
        ${filterWhere}
    `;

    // Only bind what the statement actually references: an unused parameter is
    // a bind-count error, not a no-op.
    const dataParams = keyset
      ? query.cursor
        ? [...filteredParams, pageSize, query.cursor.at, query.cursor.id]
        : [...filteredParams, pageSize]
      : [...filteredParams, pageSize, offset];

    const [rows, countRows] = await Promise.all([
      this.dataSource.query(dataSql, dataParams),
      // No COUNT on the keyset path: it is the expensive half of this query,
      // and `hasMore` answers the only question the export asks.
      keyset
        ? Promise.resolve([{ total: 0 }])
        : this.dataSource.query(countSql, filteredParams),
    ]);

    const total = Number(
      (countRows as Array<{ total: number | string }>)[0]?.total ?? 0,
    );

    const data: DocumentDetailRow[] = (rows as RawDocumentDetailRow[]).map(
      (r) => ({
        docKind: r.doc_kind,
        postedAt: r.posted_at,
        documentNumber: r.document_number ?? '',
        referenceNumber: r.reference_number ?? null,
        sku: r.sku ?? '',
        itemName: r.item_name ?? '',
        parentSku: r.parent_name ?? null,
        parentName: r.parent_name ?? null,
        unit: r.unit ?? '',
        categoryId: r.category_id ?? null,
        categoryName: r.category_name ?? null,
        brand: r.brand ?? null,
        color: r.color ?? null,
        size: r.size ?? null,
        branchId: r.branch_id ?? null,
        branchName: r.branch_name ?? null,
        receiverBranchId: r.receiver_branch_id ?? null,
        receiverBranchName: r.receiver_branch_name ?? null,
        locationId: r.location_id ?? null,
        locationCode: r.location_code ?? null,
        locationName: r.location_name ?? null,
        inQty: Number(r.in_qty ?? 0),
        inUnitPrice: Number(r.in_unit_price ?? 0),
        inValue: Number(r.in_value ?? 0),
        inSalePrice: r.in_sale_price !== null ? Number(r.in_sale_price) : null,
        outQty: Number(r.out_qty ?? 0),
        outUnitPrice: Number(r.out_unit_price ?? 0),
        outValue: Number(r.out_value ?? 0),
        outSalePrice:
          r.out_sale_price !== null ? Number(r.out_sale_price) : null,
        customerName: r.customer_name ?? null,
        notes: r.notes ?? null,
      }),
    );

    const raw = rows as RawDocumentDetailRow[];
    const last = raw[raw.length - 1];
    const totals: ReportTotals = {};
    if (!keyset) {
      const raw = (countRows as Array<Record<string, unknown>>)[0];
      for (const [field, col] of DOCUMENT_DETAIL_TOTAL_COLUMNS) {
        totals[field] = Number(raw?.[col] ?? 0);
      }
    }

    return {
      data,
      total,
      nextCursor: last ? { at: last.cursor_at, id: last.cursor_id } : null,
      hasMore: keyset ? raw.length === pageSize : offset + raw.length < total,
      totals,
    };
  }
}

interface RawDocumentDetailRow {
  doc_kind: 'GOODS_RECEIPT' | 'GOODS_ISSUE' | 'STOCK_TRANSFER';
  /** Full-precision timestamptz text — the keyset cursor, never a JS Date. */
  cursor_at: string;
  cursor_id: string;
  posted_at: Date;
  document_number: string | null;
  reference_number: string | null;
  sku: string | null;
  item_name: string | null;
  parent_name: string | null;
  unit: string | null;
  category_id: string | null;
  category_name: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  branch_id: string | null;
  branch_name: string | null;
  receiver_branch_id: string | null;
  receiver_branch_name: string | null;
  location_id: string | null;
  location_code: string | null;
  location_name: string | null;
  in_qty: string | number | null;
  in_unit_price: string | number | null;
  in_value: string | number | null;
  in_sale_price: string | number | null;
  out_qty: string | number | null;
  out_unit_price: string | number | null;
  out_value: string | number | null;
  out_sale_price: string | number | null;
  customer_name: string | null;
  notes: string | null;
}
