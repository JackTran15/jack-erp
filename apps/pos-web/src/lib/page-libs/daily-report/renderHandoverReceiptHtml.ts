import type { PosDailySummaryResult } from "@erp/shared-interfaces";
import type { CashHandoverForm } from "@erp/pos/interfaces/daily-report.interface";
import { DAILY_REPORT_PRINT_STYLE } from "@erp/pos/lib/page-libs/daily-report/dailyReportPrintStyle";
import {
  type DailyReportMeta,
  renderPrintHeader,
  renderSignatureBlock,
} from "@erp/pos/lib/page-libs/daily-report/dailyReportPrintMeta";
import {
  buildHandoverRows,
  renderDataTable,
} from "@erp/pos/lib/page-libs/daily-report/dailyReportPrintRows";

/**
 * Standalone "BÀN GIAO TIỀN" A80 receipt — printed by the "In bàn giao" button
 * in HandoverPanel. Only sections I–III (Tiền nhận bàn giao / Bàn giao /
 * Chênh lệch) as a bordered table; no Tổng tiền/Thu/Chi/Hàng/Khác sections
 * from the full report.
 */
export function renderHandoverReceiptPrintHtml(
  summary: PosDailySummaryResult,
  handover: CashHandoverForm,
  meta: DailyReportMeta,
): string {
  const body = `
    ${renderPrintHeader("Bàn giao tiền", meta)}
    ${renderDataTable(buildHandoverRows(summary, handover), handover.note)}
    ${renderSignatureBlock(meta.userName, meta.receivedByLabel)}`;

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8" />
<title>Bàn giao tiền</title>
<style>${DAILY_REPORT_PRINT_STYLE}</style></head>
<body><div class="receipt">${body}</div></body></html>`;
}
