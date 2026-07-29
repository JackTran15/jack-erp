import { escHtml } from "@erp/pos/lib/page-libs/daily-report/dailyReportPrintRows";

export interface DailyReportMeta {
  branchName: string;
  addressLine?: string;
  /** "dd/mm/yyyy - HH:mm" — when the document was printed/exported. */
  printedAtText: string;
  /** "Từ ... đến ..." — resolved from the active date-range filter. */
  rangeText: string;
  /** Current logged-in account — used for both "Người in" and "Người lập". */
  userName: string;
  cashierLabel: string;
  nvbhLabel: string;
  /** Người nhận bàn giao (resolved staff name) — printed in the signature block. */
  receivedByLabel: string;
}

/** Header block shared by both documents: store, title, meta info rows (plain text, no border). */
export function renderPrintHeader(title: string, meta: DailyReportMeta): string {
  return `
    <header class="header">
      <div class="store-name">${escHtml(meta.branchName)}</div>
      ${meta.addressLine ? `<div class="store-meta">${escHtml(meta.addressLine)}</div>` : ""}
    </header>
    <section class="doc-title"><h1>${escHtml(title)}</h1></section>
    <div class="info-row info-row-center"><span class="label">Ngày in:</span> ${escHtml(meta.printedAtText)}</div>
    <div class="info-row"><span class="label">Thời gian:</span> ${escHtml(meta.rangeText)}</div>
    <div class="info-row"><span class="label">Người in:</span> ${escHtml(meta.userName)}</div>
    <div class="info-row"><span class="label">NVBH:</span> ${escHtml(meta.nvbhLabel)}</div>
    <div class="info-row"><span class="label">Thu ngân:</span> ${escHtml(meta.cashierLabel)}</div>`;
}

/** Signature block shared by both documents — sits below the bordered data table (no border itself). */
export function renderSignatureBlock(
  userName: string,
  receivedByName?: string,
): string {
  return `
    <div class="sign-row">
      <div class="sign-col">
        <div class="sign-title">Người lập</div>
        <div class="sign-name">${escHtml(userName)}</div>
      </div>
      <div class="sign-col">
        <div class="sign-title">Người nhận</div>
        <div class="sign-name">${escHtml(receivedByName ?? "")}</div>
      </div>
    </div>`;
}
