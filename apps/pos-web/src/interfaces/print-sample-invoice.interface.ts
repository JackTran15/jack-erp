import type {
  SampleDerivedFieldKey,
  SampleDocType,
  SampleFieldKey,
  SampleFieldKind,
  SampleNumberFieldKey,
  SampleTextFieldKey,
} from "@erp/pos/types/print-sample-invoice.type";

/** Một dòng hàng trong editor. `id` chỉ để React key + xóa đúng dòng. */
export interface SampleInvoiceLine {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  /**
   * Bỏ trống (`null`) → renderer tự lấy `qty × unitPrice`. Chỉ điền khi thành
   * tiền khác tích đó, vd dòng có khuyến mãi.
   */
  lineTotal: number | null;
  discountLabel: string;
  note: string;
}

export interface SampleInvoicePayment {
  id: string;
  label: string;
  amount: number;
}

/**
 * Nội dung hóa đơn mẫu người dùng đang chỉnh ở `/cai-dat-in`.
 *
 * `texts`/`numbers` giữ giá trị của MỌI field kể cả field đang tắt — tắt rồi
 * bật lại không mất số đã nhập. `enabled` mới là thứ quyết định field có được
 * đưa vào payload hay không (renderer ẩn dòng khi thiếu key).
 */
export interface SampleInvoiceDraft {
  texts: Record<SampleTextFieldKey, string>;
  numbers: Record<SampleNumberFieldKey, number>;
  enabled: Record<SampleFieldKey, boolean>;
  /** Ghi đè con số tự tính; xóa key = quay lại tự tính. */
  overrides: Partial<Record<SampleDerivedFieldKey, number>>;
  lines: SampleInvoiceLine[];
  payments: SampleInvoicePayment[];
  docType: SampleDocType;
}

/** Bộ số tự tính từ `lines` + `payments` (đã áp `overrides`). */
export type SampleDerivedTotals = Record<SampleDerivedFieldKey, number>;

export interface SampleFieldMeta {
  key: SampleFieldKey;
  label: string;
  kind: SampleFieldKind;
  /** Luôn in — không có checkbox bật/tắt. */
  required?: boolean;
  /** Tự tính từ hàng hóa/thanh toán; có nút ghi đè. */
  derived?: boolean;
  /** Renderer hỗ trợ nhưng backend chưa có nguồn dữ liệu. */
  slot?: boolean;
  hint?: string;
}

export interface SampleFieldGroup {
  title: string;
  description?: string;
  fields: readonly SampleFieldMeta[];
}
