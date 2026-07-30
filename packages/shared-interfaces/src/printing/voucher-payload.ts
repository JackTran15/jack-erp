import { DocumentBranchInfo, DocumentColumn } from '../reporting/document-payload';
import { ReportRow } from '../invoice-report/search';

/**
 * The seam between fetching a voucher's data and rendering it (ADR-05).
 *
 * One shape for all 7 voucher kinds: stock (goods receipt / issue / transfer
 * order) and treasury (cash / bank receipt / payment). The skeleton is
 * identical across all of them — header block, info rows, line table,
 * totals, signatures — so what differs between kinds lives in the data
 * (labels, columns), never in the renderer.
 */
export enum VoucherKind {
  GOODS_RECEIPT = 'GOODS_RECEIPT',
  GOODS_ISSUE = 'GOODS_ISSUE',
  TRANSFER_ORDER = 'TRANSFER_ORDER',
  CASH_RECEIPT = 'CASH_RECEIPT',
  CASH_PAYMENT = 'CASH_PAYMENT',
  BANK_RECEIPT = 'BANK_RECEIPT',
  BANK_PAYMENT = 'BANK_PAYMENT',
}

/** One "label: value" line in the document's info block. */
export interface InfoRow {
  label: string;
  value: string;
}

/** A printable voucher — one document, ready to render in any format. */
export interface VoucherPrintPayload {
  kind: VoucherKind;
  /** Default paper size for this kind — A4 for stock vouchers, A5 for treasury. */
  paper: 'A4' | 'A5';
  /** Document title, e.g. "PHIẾU NHẬP KHO" — never carries the document number. */
  title: string;
  docNo: string;
  /**
   * The document date in long form, WITHOUT the leading word: "28 tháng 7 năm
   * 2026". Renderers print `Ngày ${docDate}` on its own centred line, so the
   * word lives in the template and the value stays a value.
   */
  docDate: string;
  branch: DocumentBranchInfo | null;
  /** Header block below the title: counterparty, deliverer, reason, etc. */
  info: InfoRow[];
  /** Line table columns, in display order — same shape as a report table. */
  lineColumns: DocumentColumn[];
  lines: ReportRow[];
  totals: ReportRow | null;
  /** Label on the totals row: "Tổng" (default) or "Cộng" on a goods issue. */
  totalsLabel?: string;
  /**
   * Vietnamese amount-in-words. Present on every voucher that carries money —
   * a transfer order has no line price, so it has none.
   */
  amountInWords?: string;
  /** Signature block labels, e.g. ["Người lập phiếu", "Người nhận hàng", …]. */
  signatures: string[];
}
