// Chuỗi UI tiếng Việt cho luồng checkout (lỗi giỏ hàng/validate, announce toast,
// toast sonner). Tách khỏi `checkout.constant.ts` (vốn chứa enum + option data).
// Mục tiêu: không hard-code chuỗi rải rác trong hook/component → dễ chỉnh & nhất
// quán. Chuỗi có tham số khai báo dạng arrow function (giống pattern react-query-key).

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

/** Toast (sonner) cho thành công/thất bại của thao tác checkout. */
export const CHECKOUT_TOASTS = {
  NO_RETURN_LINES: "Chưa có hàng nào để trả.",
  RETURN_LINE_MISSING_LOCATION:
    "Hàng trả thiếu thông tin kho/vị trí — vui lòng kiểm tra lại.",
  REVENUE_ACCOUNT_UNAVAILABLE:
    "Chưa lấy được tài khoản doanh thu để hạch toán đổi trả. Vui lòng thử lại.",
  EXCHANGE_NEEDS_ORIGINAL:
    "Đổi hàng cần chọn từ hóa đơn gốc — đổi trả nhanh chưa hỗ trợ thêm hàng mua mới.",
  QUICK_EXCHANGE_RETURN_FAILED_AFTER_SALE:
    "Đã tạo đơn mua nhưng chưa hoàn được hàng trả — vui lòng thử lại phần hoàn trả.",
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
