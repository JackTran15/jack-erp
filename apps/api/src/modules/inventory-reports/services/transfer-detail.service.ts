import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { counterpartyNameSql } from '../../inventory/location/services/counterparty-name.util';
import type { ReportTotals, TransferLeg } from '@erp/shared-interfaces';

// ──────────────────────────────────────────────────────────────────
// L2 + L3 — chi tiết phiếu điều chuyển giữa một CẶP cửa hàng có thứ tự
// ──────────────────────────────────────────────────────────────────

export interface TransferDetailQuery {
  organizationId: string;
  startDate: Date;
  endDate: Date;
  /** Ships. Ordered pair: this branch is always the exporter. */
  sourceBranchId: string;
  /** Receives. */
  destinationBranchId: string;
  /**
   * Which document is primary.
   *  - `out`        every issue from source → destination
   *  - `received`   only the issues whose paired receipt is posted
   *  - `unmatched`  only the issues without one (the difference dialog)
   *  - `in`         the receipts at destination sourced from source
   */
  leg: TransferLeg;
  page: number;
  pageSize: number;
}

export interface TransferDetailRow {
  date: string;
  documentNumber: string | null;
  /** Paired document on the other leg; null is meaningful — nobody confirmed. */
  reference: string | null;
  referenceDate: string | null;
  warehouse: string | null;
  /** "Đối tượng" — the counterparty, falling back to the branch on the other end. */
  counterparty: string | null;
  /** "Diễn giải" — the line's own note, as Báo cáo 2 does. */
  notes: string | null;
  sku: string;
  name: string;
  unit: string | null;
  qty: number;
  unitPrice: number;
  value: number;
  parentSku: string | null;
  parentName: string | null;
  group: string | null;
}

export interface TransferDetailResult {
  data: TransferDetailRow[];
  total: number;
  totals: ReportTotals;
}

/**
 * A transfer LEG, listed document line by document line.
 *
 * Deliberately not folded into `document-detail.service.ts` (Báo cáo 2). That
 * report's row is a standalone document; a row here is one half of a pair and
 * carries its counter-document. Threading the ordered branch pair, the leg
 * selector, the paired-document lookup and the matched/unmatched predicate
 * through Báo cáo 2's 560-line query would put five dead parameters on the path
 * it actually uses, inside a CTE that also feeds its keyset export.
 *
 * The prices here mirror Báo cáo 6 exactly — including using
 * `items.purchase_price` for the legacy flow rather than the per-line
 * `stock_transfer_lines.unit_price` that does exist. Using the truer price
 * would make this dialog disagree with the cell that opened it, which is worse
 * than being consistently approximate.
 */
@Injectable()
export class TransferDetailService {
  constructor(private readonly dataSource: DataSource) {}

  async detail(query: TransferDetailQuery): Promise<TransferDetailResult> {
    const legs = query.leg === 'in' ? this.receiptLegs() : this.issueLegs();

    // $1 org, $2 from, $3 to (exclusive), $4 source branch, $5 destination, $6 leg
    const outer = `
      ${legs}
      SELECT
        -- Formatted in the OUTER select only. Inside the CTE doc_date stays a
        -- timestamptz so ORDER BY l.doc_date sorts chronologically instead of
        -- alphabetically by DD/MM. Formatted here rather than in the browser so
        -- the Excel export, built from these same rows, says the same thing the
        -- screen does. Intl with vi-VN emits time-before-date, which is why this
        -- is to_char and not a JS formatter.
        to_char(l.doc_date AT TIME ZONE 'Asia/Ho_Chi_Minh',
                'DD/MM/YYYY HH24:MI') AS doc_date,
        l.doc_number,
        l.ref_number,
        to_char(l.ref_date AT TIME ZONE 'Asia/Ho_Chi_Minh',
                'DD/MM/YYYY HH24:MI') AS ref_date,
        COALESCE(sg.name, loc.name) AS warehouse,
        l.counterparty,
        l.notes,
        i.code AS sku, i.name AS item_name, i.unit,
        l.qty, l.unit_price, l.value,
        pr.code AS parent_sku, pr.name AS parent_name,
        ic.name AS category_name
      FROM legs l
      JOIN items i ON i.id = l.item_id AND i.organization_id = $1
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      LEFT JOIN locations loc ON loc.id = l.location_id
      LEFT JOIN storages sg ON sg.id = loc.storage_id`;

    const params = [
      query.organizationId,
      query.startDate,
      query.endDate,
      query.sourceBranchId,
      query.destinationBranchId,
      query.leg,
    ];
    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);

    const rows = (await this.dataSource.query(
      `${outer}
       ORDER BY l.doc_date ASC, l.doc_number ASC, i.code ASC
       LIMIT $7 OFFSET $8`,
      [...params, pageSize, (page - 1) * pageSize],
    )) as RawTransferDetailRow[];

    // Same CTE and same joins as the rows query. A relation joined in one but
    // not the other is the 42P01 that `document-detail.service.ts` documents.
    const [agg] = (await this.dataSource.query(
      `${legs}
       SELECT COUNT(*)::int AS total,
              COALESCE(SUM(l.qty), 0) AS qty,
              COALESCE(SUM(l.value), 0) AS value
         FROM legs l
         JOIN items i ON i.id = l.item_id AND i.organization_id = $1`,
      params,
    )) as { total: number; qty: string; value: string }[];

    return {
      data: rows.map((r) => this.toRow(r)),
      total: Number(agg?.total ?? 0),
      totals: {
        qty: Number(agg?.qty ?? 0),
        value: Number(agg?.value ?? 0),
      },
    };
  }

  /**
   * Issue-primary legs (`out` / `received` / `unmatched`).
   *
   * The LATERAL resolves the paired receipt's number and date. `leg` filters on
   * whether it found one, so `received` and `unmatched` partition `out` exactly
   * — which is what makes the L3 total equal the difference cell.
   */
  private issueLegs(): string {
    return `
      WITH legs AS (
        SELECT
          gi.posted_at AS doc_date,
          gi.document_number AS doc_number,
          gil.item_id,
          gil.location_id,
          gil.quantity::numeric AS qty,
          gil.unit_price::numeric AS unit_price,
          (gil.quantity::numeric * gil.unit_price::numeric) AS value,
          -- "Đối tượng": a transfer leg has no external counterparty —
          -- counterparty_kind is null on essentially every real row — so the
          -- branch on the other end is the meaningful answer. Same fallback
          -- the Xuất kho list uses, so report and list page agree.
          COALESCE(
            ${counterpartyNameSql('gi')},
            (SELECT b.name FROM branches b WHERE b.id = gi.target_branch_id)
          ) AS counterparty,
          gil.notes AS notes,
          pair.document_number AS ref_number,
          pair.posted_at AS ref_date
        FROM goods_issues gi
        JOIN goods_issue_lines gil ON gil.goods_issue_id = gi.id
        LEFT JOIN LATERAL (
          SELECT gr.document_number, gr.posted_at
          FROM goods_receipts gr
          WHERE gr.organization_id = gi.organization_id
            AND gr.status = 'POSTED'
            AND gr.purpose = 'TRANSFER_IN'
            AND gr.reference_type = 'STOCK_TRANSFER'
            AND gr.reference_id = gi.reference_id
          ORDER BY gr.posted_at ASC
          LIMIT 1
        ) pair ON gi.reference_type = 'TRANSFER_ORDER' AND gi.reference_id IS NOT NULL
        WHERE gi.organization_id = $1
          AND gi.status = 'POSTED'
          AND gi.purpose = 'TRANSFER_OUT'
          AND gi.posted_at >= $2 AND gi.posted_at < $3
          AND gi.branch_id = $4::text
          AND gi.target_branch_id = $5::uuid
          AND ($6 <> 'received'  OR pair.document_number IS NOT NULL)
          AND ($6 <> 'unmatched' OR pair.document_number IS NULL)

        UNION ALL

        -- The legacy single-phase flow. It has no counter-document, so it never
        -- has a reference and is excluded from 'unmatched' outright: it is
        -- atomic, so calling it "not yet received" would be a lie.
        SELECT
          st.posted_at AS doc_date,
          st.document_number AS doc_number,
          stl.item_id,
          COALESCE(stl.source_location_id, st.source_location_id) AS location_id,
          stl.quantity::numeric AS qty,
          COALESCE(i.purchase_price, 0)::numeric AS unit_price,
          (stl.quantity::numeric * COALESCE(i.purchase_price, 0)) AS value,
          COALESCE(
            ${counterpartyNameSql('st')},
            (SELECT b.name FROM branches b WHERE b.id = st.destination_branch_id)
          ) AS counterparty,
          stl.notes AS notes,
          NULL::varchar AS ref_number,
          NULL::timestamptz AS ref_date
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
          AND st.source_branch_id = $4::uuid
          AND st.destination_branch_id = $5::uuid
          AND $6 <> 'unmatched'
      )`;
  }

  /** Receipt-primary leg (`in`) — the LATERAL runs the other way. */
  private receiptLegs(): string {
    return `
      WITH legs AS (
        SELECT
          gr.posted_at AS doc_date,
          gr.document_number AS doc_number,
          grl.item_id,
          grl.location_id,
          grl.quantity::numeric AS qty,
          grl.unit_price::numeric AS unit_price,
          (grl.quantity::numeric * grl.unit_price::numeric) AS value,
          -- "Đối tượng": a transfer leg has no external counterparty —
          -- counterparty_kind is null on essentially every real row — so the
          -- branch on the other end is the meaningful answer. Same fallback
          -- the Xuất kho list uses, so report and list page agree.
          -- gr.source_branch_id is varchar while branches.id is uuid, so this
          -- one needs the cast the issue side does not.
          COALESCE(
            ${counterpartyNameSql('gr')},
            (SELECT b.name FROM branches b WHERE b.id::text = gr.source_branch_id)
          ) AS counterparty,
          grl.note AS notes,
          pair.document_number AS ref_number,
          pair.posted_at AS ref_date
        FROM goods_receipts gr
        JOIN goods_receipt_lines grl ON grl.goods_receipt_id = gr.id
        LEFT JOIN LATERAL (
          SELECT gi.document_number, gi.posted_at
          FROM goods_issues gi
          WHERE gi.organization_id = gr.organization_id
            AND gi.status = 'POSTED'
            AND gi.purpose = 'TRANSFER_OUT'
            AND gi.reference_type = 'TRANSFER_ORDER'
            AND gi.reference_id = gr.reference_id
          ORDER BY gi.posted_at ASC
          LIMIT 1
        ) pair ON gr.reference_type = 'STOCK_TRANSFER' AND gr.reference_id IS NOT NULL
        WHERE gr.organization_id = $1
          AND gr.status = 'POSTED'
          AND gr.purpose = 'TRANSFER_IN'
          AND gr.posted_at >= $2 AND gr.posted_at < $3
          AND gr.branch_id = $5::text
          AND gr.source_branch_id = $4
          AND $6 = 'in'

        UNION ALL

        -- Legacy transfers seen from the receiving end.
        SELECT
          st.posted_at AS doc_date,
          st.document_number AS doc_number,
          stl.item_id,
          COALESCE(stl.destination_location_id, st.destination_location_id) AS location_id,
          stl.quantity::numeric AS qty,
          COALESCE(i.purchase_price, 0)::numeric AS unit_price,
          (stl.quantity::numeric * COALESCE(i.purchase_price, 0)) AS value,
          COALESCE(
            ${counterpartyNameSql('st')},
            (SELECT b.name FROM branches b WHERE b.id = st.source_branch_id)
          ) AS counterparty,
          stl.notes AS notes,
          NULL::varchar AS ref_number,
          NULL::timestamptz AS ref_date
        FROM stock_transfers st
        JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
        JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
        WHERE st.organization_id = $1
          AND st.status = 'POSTED'
          AND st.posted_at >= $2 AND st.posted_at < $3
          AND st.source_branch_id = $4::uuid
          AND st.destination_branch_id = $5::uuid
          AND $6 = 'in'
      )`;
  }

  private toRow(r: RawTransferDetailRow): TransferDetailRow {
    return {
      // Already formatted by to_char in the outer SELECT — passed through, not
      // re-parsed. `new Date('20/08/2026 13:10')` is Invalid Date and
      // `.toISOString()` on it throws, which is exactly what this used to do.
      date: r.doc_date ?? '',
      documentNumber: r.doc_number ?? null,
      reference: r.ref_number ?? null,
      referenceDate: r.ref_date ?? null,
      warehouse: r.warehouse ?? null,
      counterparty: r.counterparty ?? null,
      notes: r.notes ?? null,
      sku: r.sku ?? '',
      name: r.item_name ?? '',
      unit: r.unit ?? null,
      qty: Number(r.qty ?? 0),
      unitPrice: Number(r.unit_price ?? 0),
      value: Number(r.value ?? 0),
      parentSku: r.parent_sku ?? null,
      parentName: r.parent_name ?? null,
      group: r.category_name ?? null,
    };
  }
}

interface RawTransferDetailRow {
  doc_date: string | null;
  doc_number: string | null;
  ref_number: string | null;
  ref_date: string | null;
  warehouse: string | null;
  counterparty: string | null;
  notes: string | null;
  sku: string | null;
  item_name: string | null;
  unit: string | null;
  qty: string | number | null;
  unit_price: string | number | null;
  value: string | number | null;
  parent_sku: string | null;
  parent_name: string | null;
  category_name: string | null;
}
