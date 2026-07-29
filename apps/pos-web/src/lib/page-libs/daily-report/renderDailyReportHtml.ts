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
  buildSummaryRows,
  renderDataTable,
} from "@erp/pos/lib/page-libs/daily-report/dailyReportPrintRows";

/**
 * "BÁO CÁO TỔNG HỢP" — full daily summary (tab Tổng hợp). Sections I–VII
 * (Tổng tiền/Thu/Chi/Công nợ/Hàng bán/Hàng trả/Khác) plus an embedded
 * BÀN GIAO TIỀN block (I–III) using the FE-only handover form state. Data
 * renders as a bordered table (grid lines between every row/column); header
 * (store/title/meta) and the signature block are plain text.
 */
function buildBody(
  summary: PosDailySummaryResult,
  handover: CashHandoverForm,
  meta: DailyReportMeta,
): string {
  return `
    ${renderPrintHeader("Báo cáo tổng hợp", meta)}
    ${renderDataTable(buildSummaryRows(summary))}
    <section class="doc-title"><h1>Bàn giao tiền</h1></section>
    ${renderDataTable(buildHandoverRows(summary, handover), handover.note)}
    ${renderSignatureBlock(meta.userName, meta.receivedByLabel)}`;
}

/** A80 print (thermal) — "In" toolbar button. "Xuất" is server-generated (see daily-report.service.ts). */
export function renderDailySummaryPrintHtml(
  summary: PosDailySummaryResult,
  handover: CashHandoverForm,
  meta: DailyReportMeta,
): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8" />
<title>Báo cáo tổng hợp</title>
<style>${DAILY_REPORT_PRINT_STYLE}</style></head>
<body><div class="receipt">${buildBody(summary, handover, meta)}</div></body></html>`;
}
