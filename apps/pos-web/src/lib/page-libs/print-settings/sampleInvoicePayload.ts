import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";

/**
 * Hóa đơn mẫu cho preview + "In thử" ở trang cài đặt máy in. Cố tình bao gồm
 * những thứ hay lộ lỗi layout nhất:
 * - tên hàng dài (kiểm tra xuống dòng cột "Tên hàng hóa"),
 * - số tiền 7 chữ số (kiểm tra cột "Thành tiền" có bị cắt mép phải không),
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
        qty: 1,
        unitPrice: 1650000,
        lineTotal: 1485000,
        discountLabel: "KM 10 % (165.000) - Khách quen",
      },
      {
        index: 2,
        name: "Dép quai ngang nữ",
        qty: 2,
        unitPrice: 250000,
        lineTotal: 500000,
      },
      {
        index: 3,
        name: "Xi đánh giày",
        qty: 3,
        unitPrice: 45000,
        lineTotal: 135000,
        note: "Tặng kèm",
      },
    ],
    totals: {
      totalQty: 6,
      subtotal: 2285000,
      itemDiscountTotal: 165000,
      grandTotal: 2120000,
      paid: 2200000,
      change: 80000,
    },
    payments: [
      { label: "Tiền mặt", amount: 1200000 },
      { label: "Chuyển khoản", amount: 1000000 },
    ],
    copies: Math.max(1, Math.floor(copies)),
    policy: { title: "", body: "" },
    closingMessage: "Giày MT hân hạnh phục vụ quý khách!",
  };
}
