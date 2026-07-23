import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";
import type { BarcodeLabelRow } from "./barcode-label-row.type";
import {
  formatBatchCode,
  labelsPerRow,
  type RenderLabelsSettings,
} from "./render-barcode-labels-html";

const priceFormatter = new Intl.NumberFormat("vi-VN");

/** pt → mm (jsPDF vẽ theo mm nhưng cỡ chữ tính theo pt). */
const PT_TO_MM = 25.4 / 72;

/** Cỡ chữ (pt) — canh theo tem mặc định MISA (`local/images/barcode-item.png`). */
const FONT = {
  sku: 8,
  price: 10,
  branch: 13,
  location: 8,
  batch: 7,
} as const;

/** Chiều cao barcode theo tỉ lệ chiều cao tem — đo từ tem MISA (~8mm / 20.45mm ≈ 0.4). */
const BARCODE_HEIGHT_RATIO = 0.4;

/** Khe dọc giữa hàng SKU/giá và hàng barcode (mm) — nhỏ để 3 hàng sát nhau như MISA. */
const ROW_GAP = 0.8;

/** Vẽ barcode CODE128 ra ảnh PNG (DPI cao) để nhúng vào PDF cho nét & quét được. */
function barcodePng(value: string): string | null {
  if (!value) return null;
  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 2,
      height: 60,
    });
  } catch {
    return null;
  }
  return canvas.toDataURL("image/png");
}

/**
 * Vẽ một tem theo tem mặc định MISA (`local/images/barcode-item.png`) — 3 hàng:
 *  • trên: SKU (giữa theo barcode) · vị trí (phải);
 *  • giữa: barcode cao (trái ~76%) · mã chi nhánh lớn (phải);
 *  • dưới: giá "X VND" (giữa theo barcode) · mã đợt (phải).
 */
function drawLabel(
  doc: jsPDF,
  row: BarcodeLabelRow,
  branchCode: string,
  batchCode: string,
  x: number,
  y: number,
  width: number,
  height: number,
  showStoreInfo: boolean,
): void {
  const padX = 0.6; // lề trong tem
  const left = x + padX;
  const right = x + width - padX; // mép phải: vị trí · CN · mã đợt cùng căn phải
  // Luôn chừa cột phải (kể cả khi ẩn mã CN/vị trí ở chuỗi cửa hàng) — barcode không
  // kéo sát mép tem, khoảng trống này tách rõ các tem cạnh nhau, dễ đọc/phân biệt.
  const sideWidth = width * 0.24; // cột phải cho mã chi nhánh (để trống ở chuỗi cửa hàng)
  const barWidth = width - sideWidth - padX;
  const barCenter = left + barWidth / 2; // tâm ngang barcode để canh giữa SKU & giá

  // 3 hàng (SKU · barcode · giá) xếp sát nhau thành một nhóm, canh giữa theo
  // chiều dọc — khoảng trắng dồn ra mép trên/dưới, giữ các hàng gần barcode.
  const skuH = FONT.sku * PT_TO_MM;
  const priceH = FONT.price * PT_TO_MM;
  const barH = height * BARCODE_HEIGHT_RATIO; // ~8mm, khớp MISA
  const groupH = skuH + ROW_GAP + barH + ROW_GAP + priceH;
  const top = y + Math.max(0, (height - groupH) / 2);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  // ── Hàng 1: SKU giữa (theo barcode) · vị trí giữa cột phải (ẩn ở chuỗi cửa hàng) ──
  doc.setFontSize(FONT.sku);
  doc.text(row.sku, barCenter, top, { baseline: "top", align: "center" });
  if (showStoreInfo && row.locationCode) {
    doc.setFontSize(FONT.location);
    doc.text(row.locationCode, right, top, {
      baseline: "top",
      align: "right",
    });
  }

  // ── Hàng 2: barcode trái · mã chi nhánh lớn phải (ẩn ở chuỗi cửa hàng) ─
  const barTop = top + skuH + ROW_GAP;
  const png = barcodePng(row.sku);
  if (png) doc.addImage(png, "PNG", left, barTop, barWidth, barH);
  if (showStoreInfo) {
    doc.setFontSize(FONT.branch);
    doc.text(branchCode, right, barTop + barH / 2, {
      baseline: "middle",
      align: "right",
    });
  }

  // ── Hàng 3: giá giữa (theo barcode) · mã đợt phải ─────────────────
  const priceTop = barTop + barH + ROW_GAP;
  doc.setFontSize(FONT.price);
  doc.text(`${priceFormatter.format(row.sellingPrice)} VND`, barCenter, priceTop, {
    baseline: "top",
    align: "center",
  });
  doc.setFontSize(FONT.batch);
  doc.text(batchCode, right, priceTop + priceH, {
    baseline: "bottom",
    align: "right",
  });
}

/**
 * Dựng PDF in tem: mỗi dòng hàng nhân bản theo "Số lượng tem", xếp `labelsPerRow`
 * tem mỗi trang (một hàng ngang = một trang @page, giống khổ giấy cuộn). Trả về Blob
 * `application/pdf` để mở trong trình xem PDF của trình duyệt.
 */
export function renderBarcodeLabelsPdf(
  rows: BarcodeLabelRow[],
  settings: RenderLabelsSettings,
): Blob {
  const { paper, branchCode, showStoreInfo } = settings;
  const batchCode = formatBatchCode(settings.printedAt);
  const cols = labelsPerRow(paper);
  const labelHeight = Math.max(
    5,
    paper.paperHeight - paper.marginTop - paper.marginBottom,
  );

  const doc = new jsPDF({
    unit: "mm",
    format: [paper.paperWidth, paper.paperHeight],
    orientation: paper.paperWidth >= paper.paperHeight ? "landscape" : "portrait",
    compress: true,
  });

  const labels = rows.flatMap((row) =>
    Array.from({ length: row.quantity }, () => row),
  );

  labels.forEach((row, index) => {
    const col = index % cols;
    if (index > 0 && col === 0) doc.addPage();
    const x = paper.marginLeft + col * (paper.columnWidth + paper.columnGap);
    drawLabel(
      doc,
      row,
      branchCode,
      batchCode,
      x,
      paper.marginTop,
      paper.columnWidth,
      labelHeight,
      showStoreInfo,
    );
  });

  return doc.output("blob");
}
