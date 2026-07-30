import type { ReceiptHorizontalAlign } from "@erp/pos/types/print-settings.type";

/**
 * Thông số layout của bản in hóa đơn (khổ A80 giấy nhiệt). Mọi field ánh xạ
 * 1-1 tới một literal trong `<style>` của
 * `lib/page-libs/checkout/printing/renderInvoiceHtml.ts`.
 *
 * Giá trị mặc định (`RECEIPT_LAYOUT_DEFAULTS`) khớp đúng literal hiện có, nên
 * khi chưa chỉnh gì bản in không đổi. Cấu hình theo máy (localStorage), không
 * đồng bộ lên server.
 */
export interface ReceiptLayoutSettings {
  // ── Khổ giấy & lề ────────────────────────────────────────────────────────
  /** `@page size`. `"auto"` = để driver tự quyết; còn lại dạng "80mm". */
  pageWidth: string;
  /** `@page margin` — mm. */
  pageMarginTop: number;
  pageMarginRight: number;
  pageMarginBottom: number;
  pageMarginLeft: number;
  /** Bề rộng khối nội dung `.receipt` — mm. */
  contentWidth: number;
  /** Căn khối nội dung trong page box. */
  align: ReceiptHorizontalAlign;
  /** Dịch ngang khối nội dung — mm, ÂM = kéo sang trái. Knob sửa lệch phải. */
  offsetX: number;
  /** Padding trên/dưới của `.receipt` — mm. */
  paddingTop: number;
  paddingBottom: number;
  /** Tỉ lệ thu/phóng toàn bản in (`zoom`). 1 = giữ nguyên. */
  scale: number;

  // ── Logo ─────────────────────────────────────────────────────────────────
  /** Bề rộng logo đầu bill — px. Chiều cao tự co theo tỉ lệ ảnh. */
  logoWidth: number;

  // ── Chữ ──────────────────────────────────────────────────────────────────
  /** Cỡ chữ nền của `html, body` — px. */
  baseFontSize: number;
  lineHeight: number;
  /** Cỡ chữ ô bảng hàng hóa — px. */
  tableFontSize: number;
  /** Padding ô bảng hàng hóa — px. */
  tableCellPaddingY: number;
  tableCellPaddingX: number;
  /** Cỡ chữ dòng "Tổng thanh toán" — px. */
  grandTotalFontSize: number;

  // ── Bảng hàng hóa ────────────────────────────────────────────────────────
  /** Bề rộng cột — %. Cột "Tên hàng hóa" ăn phần còn lại (auto). */
  colIdxWidth: number;
  colQtyWidth: number;
  colPriceWidth: number;
  colTotalWidth: number;

  // ── In thử ───────────────────────────────────────────────────────────────
  /** Số liên khi bấm "In thử" ở trang cài đặt. Không ảnh hưởng in thật. */
  testCopies: number;
}

/**
 * Các key có giá trị number — form render chúng bằng `PosNumberInput`.
 * Đặt cạnh entity (thay vì `types/`) để tránh import vòng: file này đã import
 * `types/print-settings.type.ts`.
 */
export type ReceiptLayoutNumberKey = {
  [K in keyof ReceiptLayoutSettings]: ReceiptLayoutSettings[K] extends number
    ? K
    : never;
}[keyof ReceiptLayoutSettings];

/** Metadata để form render field số bằng `.map` thay vì lặp JSX. */
export interface ReceiptLayoutNumberFieldMeta {
  key: ReceiptLayoutNumberKey;
  label: string;
  /** Đơn vị hiển thị cạnh ô nhập ("mm", "px", "%", ""). */
  unit: string;
  min: number;
  max: number;
  step: number;
  /** Giải thích ngắn dưới ô nhập. */
  hint?: string;
}

export interface ReceiptLayoutFieldGroup {
  title: string;
  description?: string;
  fields: readonly ReceiptLayoutNumberFieldMeta[];
}
