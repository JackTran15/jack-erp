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

export interface RenderLabelsSettings {
  standard: BarcodeStandard;
  showUnit: boolean;
  paper: BarcodePaperConfig;
}

/** Số tem xếp được trên một hàng ngang của khổ giấy. */
export function labelsPerRow(paper: BarcodePaperConfig): number {
  const usable = paper.paperWidth - paper.marginLeft - paper.marginRight;
  return Math.max(
    1,
    Math.floor((usable + paper.columnGap) / (paper.columnWidth + paper.columnGap)),
  );
}

function renderLabel(
  row: BarcodeLabelRow,
  settings: RenderLabelsSettings,
  labelHeightMm: number,
): string {
  const svg =
    renderBarcodeSvg(row.sku, settings.standard, { height: 40 }) ?? "";
  const price = `Giá: ${priceFormatter.format(row.sellingPrice)}đ`;
  return `
    <div class="label" style="width:${settings.paper.columnWidth}mm;height:${labelHeightMm}mm">
      <div class="row top">
        <span>${escapeHtml(row.sku)}</span>
        <span>${escapeHtml(row.locationCode)}</span>
      </div>
      <div class="barcode">${svg}</div>
      <div class="row bottom">
        <span>${escapeHtml(price)}</span>
        <span>${settings.showUnit ? escapeHtml(row.unit) : ""}</span>
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

  const labels = rows.flatMap((row) =>
    Array.from({ length: row.quantity }, () =>
      renderLabel(row, settings, labelHeight),
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
    flex-direction: column;
    color: #000;
  }
  .row { display: flex; justify-content: space-between; font-size: 8pt; font-weight: 700; }
  .barcode { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0.5mm 0; }
  .barcode svg { width: 100%; height: 100%; }
</style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;
}
