// Chuỗi UI tiếng Việt cho luồng checkout (lỗi giỏ hàng/validate, announce toast,
// toast sonner). Tách khỏi `checkout.constant.ts` (vốn chứa enum + option data).
// Mục tiêu: không hard-code chuỗi rải rác trong hook/component → dễ chỉnh & nhất
// quán. Chuỗi có tham số khai báo dạng arrow function (giống pattern react-query-key).

import { formatVnd } from "@erp/ui";

/** Lỗi hiển thị ở thanh cartError / field error trong luồng checkout. */
export const CHECKOUT_ERRORS = {
  OUT_OF_STOCK: "Hết tồn.",
  PRODUCT_NOT_FOUND: "Không tìm thấy hàng phù hợp.",
  PRODUCT_MULTIPLE_RESULTS:
    "Nhiều kết quả — chọn hàng bên dưới hoặc thu hẹp từ khóa.",
  CUSTOMER_MIN_CHARS: "Nhập ít nhất 2 ký tự.",
  CUSTOMER_MULTIPLE_RESULTS: "Nhiều kết quả — chọn từ gợi ý bên dưới.",
  CUSTOMER_REQUIRED: "Hóa đơn chưa chọn khách hàng, vui lòng kiểm tra lại.",
  MISSING_PAYMENT_ACCOUNT: "Vui lòng chọn tài khoản thanh toán cho mỗi dòng.",
  UNKNOWN_PAYMENT_ACCOUNT: "Không xác định được tài khoản thanh toán.",
} as const;

/** Thông báo nhanh (announce) hiển thị ở CheckoutAnnouncer. */
export const CHECKOUT_ANNOUNCEMENTS = {
  RETAIL_CUSTOMER: "Khách lẻ.",
  PROMOTION_CLEARED: "Đã bỏ chương trình khuyến mãi.",
  VOUCHER_APPLIED: "Đã áp dụng voucher.",
  pickedCustomer: (display: string) => `Đã chọn khách ${display}.`,
  createdAndPickedCustomer: (display: string) =>
    `Đã tạo và chọn khách ${display}.`,
  updatedCustomer: (display: string) => `Đã cập nhật khách ${display}.`,
  promotionApplied: (name: string) => `Đã áp dụng ${name}.`,
  promoOptionPicked: (label: string) => `Đã chọn ${label}.`,
  searchingVoucher: (code: string) => `Đang tìm mã ưu đãi ${code}.`,
  voucherAppliedCode: (code: string) => `Đã áp dụng voucher ${code}.`,
  pointsApplied: (points: number) => `Đã áp dụng ${points} điểm.`,
  POINTS_CLEARED: "Đã bỏ áp dụng điểm.",
  invoiceCanceled: "Đã hủy hóa đơn.",
  estimatePrinted: "Đã in hóa đơn tạm tính.",
  draftSaved: (code: string) => `Đã lưu tạm hóa đơn ${code}`,
  draftUpdated: (code: string) => `Đã cập nhật hóa đơn lưu tạm ${code}`,
  /** Hậu tố " cho <khách>" hoặc " (khách lẻ)" cho announce thanh toán/đổi trả. */
  customerSuffix: (display: string | null) =>
    display ? ` cho ${display}` : " (khách lẻ)",
  paymentRecorded: (who: string, amountText: string, methodLabel: string) =>
    `Đã ghi nhận thanh toán${who}, ${amountText}, ${methodLabel}.`,
  returnRecorded: (who: string, amountText: string) =>
    `Đã ghi nhận đổi trả${who}, ${amountText}.`,
} as const;

/**
 * Hộp xác nhận hoán đổi CTKM đang thắng (UOW-04/T-04-03) — khi thu ngân tick
 * một CTKM đang bị chương trình khác giành mất tài nguyên. Giữ đúng nội dung
 * tham chiếu MISA ("CTKM A và B cùng áp dụng cho 1 hàng hóa...") vì thu ngân
 * đã quen câu này; chỉ thay bằng tên hai chương trình thật thay vì A/B.
 */
export const PROMOTION_SWAP_CONFIRM = {
  TITLE: "Đổi chương trình khuyến mãi",
  message: (incumbentName: string, candidateName: string) =>
    `Chương trình "${incumbentName}" và "${candidateName}" cùng áp dụng cho 1 hàng hóa. Bạn có muốn đổi thành áp dụng chương trình "${candidateName}" không?`,
  CONFIRM_LABEL: "Đổi chương trình",
  CANCEL_LABEL: "Huỷ",
} as const;

/**
 * Hộp xác nhận bỏ hẳn một CTKM đang áp (UOW-09/T-09-03, đóng A-13) — thu ngân
 * untick dòng "Đã áp dụng" trong dialog, hoặc bấm X ở dòng tổng "Khuyến mại"
 * (T-09-04, dùng chung constant này). Bỏ tick lại một CTKM đã loại (dòng "Đã
 * bỏ áp dụng") không qua hộp này — chỉ hành động loại mới cần xác nhận.
 * Nêu rõ số tiền còn phải thu trước/sau (AC-34) — không chỉ tên chương trình.
 */
export const PROMOTION_EXCLUDE_CONFIRM = {
  TITLE: "Bỏ áp dụng khuyến mại",
  message: (programName: string, beforeAmount: number, afterAmount: number) =>
    `Bỏ áp dụng chương trình "${programName}"? Còn phải thu sẽ đổi từ ${formatVnd(beforeAmount)} thành ${formatVnd(afterAmount)}.`,
  messageAll: (programNames: string[], beforeAmount: number, afterAmount: number) =>
    `Bỏ áp dụng ${programNames.length > 1 ? "các chương trình" : "chương trình"} ${programNames.map((n) => `"${n}"`).join(", ")}? Còn phải thu sẽ đổi từ ${formatVnd(beforeAmount)} thành ${formatVnd(afterAmount)}.`,
  /** Không có số tiền để tính (chưa có preview) — chỉ nêu tên, không nên xảy ra bình thường. */
  messageNoAmount: (programName: string) =>
    `Bỏ áp dụng chương trình "${programName}"? Số tiền được giảm cho hóa đơn này sẽ thay đổi.`,
  /** Bản `messageAll` không kèm số tiền — cùng lý do với `messageNoAmount`. */
  messageAllNoAmount: (programNames: string[]) =>
    `Bỏ áp dụng ${programNames.length > 1 ? "các chương trình" : "chương trình"} ${programNames.map((n) => `"${n}"`).join(", ")}? Số tiền được giảm cho hóa đơn này sẽ thay đổi.`,
  CONFIRM_LABEL: "Bỏ áp dụng",
  CANCEL_LABEL: "Huỷ",
} as const;

/** Toast (sonner) cho thành công/thất bại của thao tác checkout. */
export const CHECKOUT_TOASTS = {
  NO_RETURN_LINES: "Chưa có hàng nào để trả.",
  RETURN_LINE_MISSING_LOCATION:
    "Hàng trả thiếu thông tin kho/vị trí — vui lòng kiểm tra lại.",
  REVENUE_ACCOUNT_UNAVAILABLE:
    "Chưa lấy được tài khoản doanh thu để hạch toán đổi trả. Vui lòng thử lại.",
  /** Chỉ còn dùng cho luồng đổi trả THEO hóa đơn — thiếu hóa đơn gốc ở đó là bug. */
  EXCHANGE_NEEDS_ORIGINAL: "Đổi hàng theo hóa đơn cần chọn hóa đơn gốc.",
  PAYMENT_FAILED: "Không thu được tiền",
  RETURN_FAILED: "Không ghi nhận được đổi trả",
  DRAFT_SAVE_FAILED: "Không lưu được hóa đơn lưu tạm",
  ESTIMATE_FAILED: "Không in được hóa đơn tạm tính",
  /** BE 400 khi POST /invoices/:id/redeem-points (thẻ/balance/giá trị đơn). */
  REDEEM_FAILED: "Áp dụng điểm thất bại",
  /** Thu ngân gõ SL âm ở dòng bán — giá trị bị kẹp về mức tối thiểu. */
  NEGATIVE_QTY_CLAMPED:
    "Số lượng bán không thể là số âm — đã đặt về 1. Muốn trả hàng, hãy dùng chức năng đổi/trả.",
} as const;

/**
 * Chuỗi UI cho luồng loyalty (DiscountPointDialog, MembershipCard empty state).
 * Tách thành catalog riêng để dễ tra cứu.
 */
export const LOYALTY_TEXT = {
  NO_CARD: "Khách chưa có thẻ thành viên",
  NO_CUSTOMER: "Hãy chọn khách hàng để dùng điểm",
  APPLY: "Áp dụng",
  CLEAR: "Bỏ dùng điểm",
  POINTS_SUFFIX: "điểm",
  LOYALTY_POINTS_LABEL: "Điểm tích lũy",
} as const;

/** Lý do mặc định gửi BE khi đổi/trả tại POS (không phải UI copy thuần). */
export const CHECKOUT_RETURN_REASONS = {
  EXCHANGE: "Đổi hàng tại POS",
  RETURN: "Đổi trả tại POS",
} as const;
