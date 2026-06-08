import { Injectable } from '@nestjs/common';
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
 *   - `goods_issues` has no customer_name / customer_id column today.
 *     Counterparty is the `provider_id` ("Đối tượng" — supplier/partner).
 *     We surface `providers.name` as `customer_name`.
 *   - `goods_issue_lines` has no `location_id` — we use the header
 *     `goods_issues.location_id` instead.
 *   - `stock_transfer_lines.source_location_id` is nullable on legacy
 *     rows; falls back to the header `source_location_id` via COALESCE.
 *   - `branches` table has no `code` column (mirrors how
 *     `transfer-report.service.ts` returns `branchCode: null`).
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
}

export interface DocumentDetailResult {
  data: DocumentDetailRow[];
  total: number;
}

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
          NULL::numeric AS in_sale_price,
          0::numeric AS out_qty,
          0::numeric AS out_unit_price,
          0::numeric AS out_value,
          NULL::numeric AS out_sale_price,
          NULL::text AS customer_name,
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
          NULL::numeric AS in_sale_price,
          gil.quantity::numeric AS out_qty,
          gil.unit_price::numeric AS out_unit_price,
          (gil.quantity::numeric * gil.unit_price::numeric) AS out_value,
          NULL::numeric AS out_sale_price,
          p.name AS customer_name,
          gil.notes
        FROM goods_issues gi
        JOIN goods_issue_lines gil ON gil.goods_issue_id = gi.id
        LEFT JOIN inventory_providers p ON p.id = gi.provider_id
        WHERE gi.organization_id = $1
          AND gi.status = 'POSTED'
          AND gi.posted_at >= $2 AND gi.posted_at < $3
          AND ($4::text[] IS NULL OR gi.branch_id = ANY($4::text[]))

        UNION ALL

        -- 3) Stock transfers (Điều chuyển) — OUT-side from source branch
        SELECT
          'STOCK_TRANSFER'::text AS doc_kind,
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
          NULL::numeric AS in_sale_price,
          stl.quantity::numeric AS out_qty,
          COALESCE(i_st.purchase_price, 0)::numeric AS out_unit_price,
          (stl.quantity::numeric * COALESCE(i_st.purchase_price, 0)::numeric) AS out_value,
          NULL::numeric AS out_sale_price,
          NULL::text AS customer_name,
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
        l.in_sale_price,
        l.out_qty,
        l.out_unit_price,
        l.out_value,
        l.out_sale_price,
        l.customer_name,
        l.notes
      FROM lines l
      JOIN items i ON i.id = l.item_id AND i.organization_id = $1
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      LEFT JOIN branches bs ON bs.id::text = l.branch_id AND bs.organization_id = $1
      LEFT JOIN branches br ON br.id::text = l.receiver_branch_id AND br.organization_id = $1
      LEFT JOIN locations loc ON loc.id = l.location_id
      WHERE ($5::uuid[] IS NULL OR i.category_id = ANY($5))
        AND ($6::text IS NULL OR i.code ILIKE '%' || $6 || '%' OR i.name ILIKE '%' || $6 || '%')
      ORDER BY l.posted_at DESC, l.document_number ASC
      LIMIT $7 OFFSET $8
    `;

    const countSql = `
      ${linesCte}
      SELECT COUNT(*)::int AS total
      FROM lines l
      JOIN items i ON i.id = l.item_id AND i.organization_id = $1
      WHERE ($5::uuid[] IS NULL OR i.category_id = ANY($5))
        AND ($6::text IS NULL OR i.code ILIKE '%' || $6 || '%' OR i.name ILIKE '%' || $6 || '%')
    `;

    const sharedParams = [
      query.organizationId,
      query.startDate,
      query.endDate,
      branchIds,
      categoryIds,
      search,
    ];

    const [rows, countRows] = await Promise.all([
      this.dataSource.query(dataSql, [...sharedParams, pageSize, offset]),
      this.dataSource.query(countSql, sharedParams),
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

    return { data, total };
  }
}

interface RawDocumentDetailRow {
  doc_kind: 'GOODS_RECEIPT' | 'GOODS_ISSUE' | 'STOCK_TRANSFER';
  posted_at: Date;
  document_number: string | null;
  reference_number: string | null;
  sku: string | null;
  item_name: string | null;
  parent_name: string | null;
  unit: string | null;
  category_id: string | null;
  category_name: string | null;
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
