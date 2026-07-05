import type {
  BarcodePaperConfig,
  BarcodeStandard,
} from "../../../store/page-stores/inventory-item-barcodes/barcode-print-settings.interface";
import type { BarcodeLabelRow } from "./barcode-label-row.type";
import { renderBarcodeSvg } from "./render-barcode-svg";

const priceFormatter = new Intl.NumberFormat("vi-VN");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Mã đợt in trên tem: MMYY tại thời điểm in (07/2026 → "0726"). */
export function formatBatchCode(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  return `${mm}${yy}`;
}

export interface RenderLabelsSettings {
  standard: BarcodeStandard;
  paper: BarcodePaperConfig;
  /** Thời điểm in — nguồn của mã MMYY trên tem. */
  printedAt: Date;
  /** Mã chi nhánh in ở cột phải của tem (vd "CM"). */
  branchCode: string;
}

/** Số tem xếp được trên một hàng ngang của khổ giấy. */
export function labelsPerRow(paper: BarcodePaperConfig): number {
  const usable = paper.paperWidth - paper.marginLeft - paper.marginRight;
  return Math.max(
    1,
    Math.floor((usable + paper.columnGap) / (paper.columnWidth + paper.columnGap)),
  );
}

/**
 * Một tem theo mẫu MISA — grid 2 cột:
 * trái (SKU / barcode / giá "X VND"), phải (vị trí / mã chi nhánh / ngày MMYY).
 */
function renderLabel(
  row: BarcodeLabelRow,
  settings: RenderLabelsSettings,
  labelHeightMm: number,
  batchCode: string,
): string {
  const svg =
    renderBarcodeSvg(row.sku, settings.standard, { height: 40 }) ?? "";
  const price = `${priceFormatter.format(row.sellingPrice)} VND`;
  return `
    <div class="label" style="width:${settings.paper.columnWidth}mm;height:${labelHeightMm}mm">
      <div class="main">
        <div class="sku">${escapeHtml(row.sku)}</div>
        <div class="barcode">${svg}</div>
        <div class="price">${escapeHtml(price)}</div>
      </div>
      <div class="side">
        <div class="location">${escapeHtml(row.locationCode)}</div>
        <div class="branch">${escapeHtml(settings.branchCode)}</div>
        <div class="batch">${batchCode}</div>
      </div>
    </div>`;
}

/**
 * Dựng HTML tự chứa cho việc in tem: mỗi dòng hàng được nhân bản theo
 * "Số lượng tem", xếp `labelsPerRow` tem mỗi trang giấy (khổ giấy in tem
 * dạng cuộn: 1 hàng tem = 1 trang @page).
 */
export function renderBarcodeLabelsHtml(
  rows: BarcodeLabelRow[],
  settings: RenderLabelsSettings,
): string {
  const { paper } = settings;
  const labelHeight = Math.max(
    5,
    paper.paperHeight - paper.marginTop - paper.marginBottom,
  );
  const perRow = labelsPerRow(paper);
  const batchCode = formatBatchCode(settings.printedAt);

  const labels = rows.flatMap((row) =>
    Array.from({ length: row.quantity }, () =>
      renderLabel(row, settings, labelHeight, batchCode),
    ),
  );

  const pages: string[] = [];
  for (let i = 0; i < labels.length; i += perRow) {
    pages.push(
      `<div class="page">${labels.slice(i, i + perRow).join("")}</div>`,
    );
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>In tem mã vạch</title>
<style>
  @page {
    size: ${paper.paperWidth}mm ${paper.paperHeight}mm;
    margin: ${paper.marginTop}mm ${paper.marginRight}mm ${paper.marginBottom}mm ${paper.marginLeft}mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; }
  html, body { font-family: Arial, Helvetica, sans-serif; }
  .page {
    display: flex;
    gap: ${paper.columnGap}mm;
    break-after: page;
    page-break-after: always;
  }
  .label {
    overflow: hidden;
    display: flex;
    gap: 1mm;
    color: #000;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .side {
    width: 22%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    text-align: center;
  }
  .sku { font-size: 8pt; font-weight: 700; text-align: center; white-space: nowrap; }
  .barcode { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0.5mm 0; }
  .barcode svg { width: 100%; height: 100%; }
  .price { font-size: 9pt; font-weight: 700; text-align: center; }
  .location { font-size: 7pt; font-weight: 700; }
  .branch { font-size: 11pt; font-weight: 700; }
  .batch { font-size: 7pt; font-weight: 700; }
</style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;
}
