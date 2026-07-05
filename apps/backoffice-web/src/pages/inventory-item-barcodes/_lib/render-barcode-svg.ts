import JsBarcode from "jsbarcode";
import type { BarcodeStandard } from "../../../store/page-stores/inventory-item-barcodes/barcode-print-settings.interface";

/**
 * EAN-13 chỉ nhận 12 chữ số (checksum tự sinh) hoặc 13 chữ số với checksum
 * hợp lệ. SKU chữ-số thông thường không bao giờ đạt — caller fallback CODE128.
 */
export function isValidEan13(value: string): boolean {
  if (!/^\d{12,13}$/.test(value)) return false;
  if (value.length === 12) return true;
  const digits = value.split("").map(Number);
  const sum = digits
    .slice(0, 12)
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return digits[12] === (10 - (sum % 10)) % 10;
}

/** Chuẩn thực tế dùng để vẽ: EAN-13 không hợp lệ thì in bằng CODE128. */
export function resolveBarcodeFormat(
  value: string,
  standard: BarcodeStandard,
): BarcodeStandard {
  return standard === "EAN13" && isValidEan13(value) ? "EAN13" : "CODE128";
}

export interface RenderBarcodeSvgOptions {
  /** Chiều cao vạch (px trong hệ toạ độ SVG). */
  height?: number;
  /** Độ rộng 1 vạch đơn vị. */
  barWidth?: number;
}

/**
 * Vẽ barcode vào một SVG tách rời và trả về markup — dùng để nhúng vào
 * HTML in tem. Trả về null khi giá trị rỗng/không vẽ được.
 */
export function renderBarcodeSvg(
  value: string,
  standard: BarcodeStandard,
  options?: RenderBarcodeSvgOptions,
): string | null {
  if (!value) return null;
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(el, value, {
      format: resolveBarcodeFormat(value, standard),
      displayValue: false,
      margin: 0,
      height: options?.height ?? 40,
      width: options?.barWidth ?? 1.4,
    });
  } catch {
    return null;
  }
  return el.outerHTML;
}
