import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";

/**
 * Hóa đơn mẫu cho preview + "In thử" ở trang cài đặt máy in. Cố tình bao gồm
 * những thứ hay lộ lỗi layout nhất:
 * - tên hàng dài (kiểm tra xuống dòng cột "Tên hàng hóa"),
 * - số tiền 8 chữ số (kiểm tra cột "Thành tiền" có bị cắt mép phải không),
 * - đủ dòng info + nhiều dòng summary (kiểm tra chiều dài bill),
 * - nhiều phương thức thanh toán.
 *
 * `issuedAt` cố định, KHÔNG dùng `new Date()`: preview render lại mỗi lần chỉnh
 * knob, ngày giờ nhảy sẽ làm khó so sánh giữa hai lần in thử.
 */
export const SAMPLE_INVOICE_ISSUED_AT = new Date("2026-05-01T09:30:00");

export function buildSampleInvoicePayload(copies: number): InvoicePayload {
  return {
    store: {
      name: "Giày MT Cần Thơ",
      address: "95-97 Nguyễn Trãi, Ninh Kiều, Cần Thơ",
      phone: "0834561317",
    },
    invoiceNumber: "MAU0000001",
    issuedAt: SAMPLE_INVOICE_ISSUED_AT,
    info: {
      customerName: "Nguyễn Thị Mẫu Đơn",
      customerPhone: "0901234567",
      cashierName: "Thu ngân mẫu",
      salespersonName: "NVBH mẫu",
      note: "Hóa đơn mẫu dùng để căn chỉnh máy in",
    },
    lines: [
      {
        index: 1,
        name: "Giày thể thao nam da lộn cổ thấp size 42 màu xanh navy",
        qty: 10,
        unitPrice: 1650000,
        lineTotal: 14850000,
        discountLabel: "KM 10 % (1.650.000) - Khách quen",
      },
      {
        index: 2,
        name: "Dép quai ngang nữ",
        qty: 11,
        unitPrice: 250000,
        lineTotal: 2750000,
      },
      {
        index: 3,
        name: "Xi đánh giày",
        qty: 12,
        unitPrice: 45000,
        lineTotal: 540000,
        note: "Tặng kèm",
      },
    ],
    totals: {
      totalQty: 33,
      subtotal: 19790000,
      itemDiscountTotal: 1650000,
      grandTotal: 18140000,
      paid: 18220000,
      change: 80000,
    },
    payments: [
      { label: "Tiền mặt", amount: 10220000 },
      { label: "Chuyển khoản", amount: 8000000 },
    ],
    copies: Math.max(1, Math.floor(copies)),
    policy: { title: "", body: "" },
    closingMessage: "Giày MT hân hạnh phục vụ quý khách!",
  };
}
