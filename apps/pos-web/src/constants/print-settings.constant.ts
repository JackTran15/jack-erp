import type {
  ReceiptLayoutFieldGroup,
  ReceiptLayoutSettings,
} from "@erp/pos/interfaces/print-settings.interface";
import type { ReceiptHorizontalAlign } from "@erp/pos/types/print-settings.type";

/**
 * Mặc định = ĐÚNG literal đang hardcode trong `renderInvoiceHtml.ts` trước khi
 * tham số hóa. Đổi ở đây là đổi bản in của mọi máy chưa tự cấu hình — sau khi
 * test trên máy in thật, dán bộ số chốt được (nút "Copy JSON" ở trang cài đặt)
 * đè lên object này.
 */
export const RECEIPT_LAYOUT_DEFAULTS: ReceiptLayoutSettings = {
  pageWidth: "80mm",
  pageMarginTop: 0,
  pageMarginRight: 0,
  pageMarginBottom: 0,
  pageMarginLeft: 0,
  contentWidth: 72,
  align: "center",
  offsetX: 0,
  paddingTop: 2,
  paddingBottom: 4,
  scale: 1,

  logoWidth: 80,

  baseFontSize: 11,
  lineHeight: 1.45,
  tableFontSize: 10.5,
  tableCellPaddingY: 2,
  tableCellPaddingX: 3,
  grandTotalFontSize: 14,

  colIdxWidth: 8,
  colQtyWidth: 11,
  colPriceWidth: 21,
  colTotalWidth: 23,

  testCopies: 1,
};

/** Khổ giấy nhiệt phổ biến. "auto" = nhường driver quyết định. */
export const PAPER_WIDTH_PRESETS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "80mm", label: "80mm (A80 - mặc định)" },
  { value: "78mm", label: "78mm" },
  { value: "76mm", label: "76mm" },
  { value: "58mm", label: "58mm (A58)" },
  { value: "auto", label: "Auto (theo driver máy in)" },
];

export const RECEIPT_ALIGN_OPTIONS: ReadonlyArray<{
  value: ReceiptHorizontalAlign;
  label: string;
}> = [
  { value: "center", label: "Canh giữa (mặc định)" },
  { value: "left", label: "Ghim mép trái" },
];

/**
 * Nhóm field cho form cài đặt. Thứ tự nhóm theo mức độ hữu ích khi đang truy
 * lỗi bill lệch: khổ giấy/lề trước, rồi mới tới chữ và bảng.
 */
export const RECEIPT_LAYOUT_FIELD_GROUPS: readonly ReceiptLayoutFieldGroup[] = [
  {
    title: "Khổ giấy & lề",
    description:
      "Nhóm quyết định bill có bị lệch hay cắt mép. Chỉnh ở đây trước.",
    fields: [
      {
        key: "contentWidth",
        label: "Bề rộng nội dung",
        unit: "mm",
        min: 20,
        max: 200,
        step: 1,
        hint: "Bề rộng khối in. Phải nhỏ hơn khổ giấy — giấy 80mm thường chỉ in được ~72mm.",
      },
      {
        key: "offsetX",
        label: "Dịch ngang",
        unit: "mm",
        min: -30,
        max: 30,
        step: 0.5,
        hint: "Số ÂM kéo bill sang trái. Đây là knob chính để sửa lỗi lệch phải.",
      },
      {
        key: "pageMarginLeft",
        label: "Lề trái trang",
        unit: "mm",
        min: 0,
        max: 30,
        step: 0.5,
      },
      {
        key: "pageMarginRight",
        label: "Lề phải trang",
        unit: "mm",
        min: 0,
        max: 30,
        step: 0.5,
      },
      {
        key: "pageMarginTop",
        label: "Lề trên trang",
        unit: "mm",
        min: 0,
        max: 30,
        step: 0.5,
      },
      {
        key: "pageMarginBottom",
        label: "Lề dưới trang",
        unit: "mm",
        min: 0,
        max: 30,
        step: 0.5,
      },
      {
        key: "paddingTop",
        label: "Padding trên",
        unit: "mm",
        min: 0,
        max: 20,
        step: 0.5,
      },
      {
        key: "paddingBottom",
        label: "Padding dưới",
        unit: "mm",
        min: 0,
        max: 20,
        step: 0.5,
      },
      {
        key: "scale",
        label: "Tỉ lệ thu phóng",
        unit: "×",
        min: 0.5,
        max: 1.5,
        step: 0.05,
        hint: "Thu nhỏ toàn bộ bill khi nội dung vẫn tràn dù đã chỉnh bề rộng.",
      },
    ],
  },
  {
    title: "Logo",
    fields: [
      {
        key: "logoWidth",
        label: "Bề rộng logo",
        unit: "px",
        min: 20,
        max: 200,
        step: 5,
        hint: "Chiều cao tự co theo tỉ lệ ảnh. 80px ≈ 30% bề ngang bill khổ 80mm.",
      },
    ],
  },
  {
    title: "Chữ",
    fields: [
      {
        key: "baseFontSize",
        label: "Cỡ chữ nền",
        unit: "px",
        min: 6,
        max: 20,
        step: 0.5,
      },
      {
        key: "lineHeight",
        label: "Giãn dòng",
        unit: "",
        min: 1,
        max: 2.5,
        step: 0.05,
      },
      {
        key: "tableFontSize",
        label: "Cỡ chữ bảng hàng",
        unit: "px",
        min: 6,
        max: 20,
        step: 0.5,
      },
      {
        key: "tableCellPaddingY",
        label: "Padding ô — dọc",
        unit: "px",
        min: 0,
        max: 12,
        step: 1,
      },
      {
        key: "tableCellPaddingX",
        label: "Padding ô — ngang",
        unit: "px",
        min: 0,
        max: 12,
        step: 1,
        hint: "Giảm giá trị này khi cột bên phải bị cắt sát.",
      },
      {
        key: "grandTotalFontSize",
        label: "Cỡ chữ Tổng thanh toán",
        unit: "px",
        min: 8,
        max: 28,
        step: 0.5,
      },
    ],
  },
  {
    title: "Bảng hàng hóa",
    description:
      'Bề rộng cột tính theo %. Cột "Tên hàng hóa" tự ăn phần còn lại, nên tổng 4 cột dưới đây nên dưới 80%.',
    fields: [
      {
        key: "colIdxWidth",
        label: "Cột STT",
        unit: "%",
        min: 0,
        max: 30,
        step: 1,
      },
      {
        key: "colQtyWidth",
        label: "Cột SL",
        unit: "%",
        min: 0,
        max: 30,
        step: 1,
      },
      {
        key: "colPriceWidth",
        label: "Cột Đơn giá",
        unit: "%",
        min: 0,
        max: 40,
        step: 1,
      },
      {
        key: "colTotalWidth",
        label: "Cột Thành tiền",
        unit: "%",
        min: 0,
        max: 40,
        step: 1,
      },
    ],
  },
  {
    title: "In thử",
    fields: [
      {
        key: "testCopies",
        label: "Số liên in thử",
        unit: "liên",
        min: 1,
        max: 5,
        step: 1,
        hint: 'Chỉ áp dụng cho nút "In thử" ở trang này.',
      },
    ],
  },
];
