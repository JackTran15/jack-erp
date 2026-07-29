import type { PosDailySummaryResult } from "@erp/shared-interfaces";
import { formatNumberVi } from "@erp/pos/lib/page-libs/daily-report/formatDailyReport";
import type { CashHandoverForm } from "@erp/pos/interfaces/daily-report.interface";

/**
 * One printed line: a bold section header (no value, level 0), or a
 * label:value row. `level` 1 = direct child of a I./II./III. section;
 * level 2 = nested one deeper (e.g. the breakdown under "Tổng SL hóa đơn").
 */
export interface DocRow {
  label: string;
  value?: number;
  bold?: boolean;
  level?: 1 | 2;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const escHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );

/**
 * Render rows as a bordered `<table>` (grid lines between every row/column) —
 * used identically for print (A80) and .xls export, matching the reference
 * document's grid look. An optional trailing "Ghi chú" row is appended inside
 * the same table (spans both columns).
 */
export function renderDataTable(rows: DocRow[], note?: string): string {
  const dataRows = rows
    .map((r) => {
      const cls = r.bold ? ' class="bold"' : "";
      const labelCls = r.level ? ` class="level-${r.level}"` : "";
      const value = r.value === undefined ? "" : formatNumberVi(r.value);
      return `<tr${cls}><td${labelCls}>${escHtml(r.label)}</td><td class="value">${value}</td></tr>`;
    })
    .join("");
  const noteRow =
    note !== undefined
      ? `<tr><td colspan="2">Ghi chú: ${escHtml(note)}</td></tr>`
      : "";
  return `<table class="data-table">${dataRows}${noteRow}</table>`;
}

/** I–VII: Tổng tiền / Thu / Chi / Công nợ / Hàng bán / Hàng trả / Khác. */
export function buildSummaryRows(summary: PosDailySummaryResult): DocRow[] {
  return [
    { label: "I. Tổng tiền", bold: true },
    { label: "Tổng thu", value: summary.revenue.total, level: 1 },
    { label: "Tổng chi", value: summary.expense.total, level: 1 },
    { label: "Thu - chi", value: summary.netCashFlow, level: 1 },
    { label: "II. Thu", bold: true },
    { label: "Tiền mặt", value: summary.revenue.cash, level: 1 },
    { label: "Thẻ", value: summary.revenue.card, level: 1 },
    { label: "Chuyển khoản", value: summary.revenue.bankTransfer, level: 1 },
    { label: "Voucher", value: summary.revenue.voucher, level: 1 },
    { label: "Điểm", value: summary.revenue.points, level: 1 },
    { label: "III. Chi", bold: true },
    { label: "Tiền mặt", value: summary.expense.cash, level: 1 },
    { label: "Chuyển khoản", value: summary.expense.bankTransfer, level: 1 },
    // Net change in outstanding debt for the window (Ghi nợ − Giảm nợ).
    {
      label: "IV. Công nợ",
      value: round2(summary.debt.newDebt - summary.debt.debtCollected),
      bold: true,
    },
    { label: "V. Hàng bán", bold: true },
    { label: "Số lượng", value: summary.goodsSold.quantity, level: 1 },
    { label: "Giá trị", value: summary.goodsSold.value, level: 1 },
    // Hàng trả prints as negative (goods leaving the sold total).
    { label: "VI. Hàng trả", bold: true },
    { label: "Số lượng", value: -summary.goodsReturned.quantity, level: 1 },
    { label: "Giá trị", value: -summary.goodsReturned.value, level: 1 },
    { label: "VII. Khác", bold: true },
    { label: "Tổng SL hóa đơn", value: summary.other.totalInvoices, level: 1 },
    { label: "SL hóa đơn bán hàng", value: summary.other.saleInvoices, level: 2 },
    { label: "SL hóa đơn đổi trả", value: summary.other.returnInvoices, level: 2 },
    {
      label: "SL hóa đơn đổi trả, mua thêm",
      value: summary.other.exchangeInvoices,
      level: 2,
    },
    { label: "SL Voucher", value: summary.other.voucherCount, level: 1 },
    {
      label: "SL biên lai thanh toán thẻ",
      value: summary.other.cardReceiptCount,
      level: 1,
    },
    { label: "SL mã ưu đãi", value: summary.other.promoCodeCount, level: 1 },
  ];
}

/** I–III: Tiền nhận bàn giao / Bàn giao / Chênh lệch — shared by the full report and the standalone receipt. */
export function buildHandoverRows(
  summary: PosDailySummaryResult,
  handover: CashHandoverForm,
): DocRow[] {
  // Chênh lệch = tiền đầu kỳ + thu tiền mặt − chi tiền mặt − tiền bàn giao (đã đếm).
  const variance =
    handover.openingAmount +
    summary.revenue.cash -
    summary.expense.cash -
    handover.handoverAmount;

  return [
    { label: "I. Tiền nhận bàn giao", value: handover.openingAmount, bold: true },
    { label: "II. Bàn giao", bold: true },
    { label: "Tiền mặt", value: handover.handoverAmount, level: 1 },
    { label: "Tổng SL hóa đơn", value: summary.other.totalInvoices, level: 1 },
    { label: "SL hóa đơn bán hàng", value: summary.other.saleInvoices, level: 2 },
    { label: "SL hóa đơn đổi trả", value: summary.other.returnInvoices, level: 2 },
    {
      label: "SL hóa đơn đổi trả, mua thêm",
      value: summary.other.exchangeInvoices,
      level: 2,
    },
    { label: "SL biên lai TT thẻ", value: summary.other.cardReceiptCount, level: 1 },
    { label: "SL voucher", value: summary.other.voucherCount, level: 1 },
    { label: "SL mã ưu đãi", value: summary.other.promoCodeCount, level: 1 },
    { label: "III. Chênh lệch", value: round2(variance), bold: true },
  ];
}
