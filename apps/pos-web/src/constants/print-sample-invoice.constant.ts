import type {
  SampleFieldGroup,
  SampleInvoiceDraft,
} from "@erp/pos/interfaces/print-sample-invoice.interface";
import type { SampleDocType } from "@erp/pos/types/print-sample-invoice.type";

/**
 * Hóa đơn mẫu mặc định cho preview + "In thử" ở `/cai-dat-in`. Cố tình bao gồm
 * những thứ hay lộ lỗi layout nhất: tên hàng dài (xuống dòng cột "Tên hàng
 * hóa"), số tiền 8 chữ số (cắt mép cột "Thành tiền"), đủ dòng info, nhiều
 * phương thức thanh toán.
 *
 * `texts`/`numbers` khai báo giá trị cho MỌI field kể cả field mặc định tắt —
 * người dùng bật lên là có sẵn số liệu mẫu hợp lý để xem bill ra sao.
 *
 * Ngày giờ cố định, KHÔNG dùng `new Date()`: preview render lại mỗi lần chỉnh
 * knob, ngày giờ nhảy sẽ làm khó so sánh giữa hai lần in thử.
 */
export const SAMPLE_INVOICE_DRAFT_DEFAULTS: SampleInvoiceDraft = {
  docType: "SALE",

  texts: {
    "store.name": "Giày MT Cần Thơ",
    "store.address": "95-97 Nguyễn Trãi, Ninh Kiều, Cần Thơ",
    "store.phone": "0834561317",

    invoiceNumber: "MAU0000001",
    issuedAt: "2026-05-01T09:30",
    voucherCode: "MAUVOUCHER",
    provisionalNote: "Phiếu tạm tính - chưa thanh toán",

    "info.returnForInvoiceRef": "HD0000123",
    "info.customerName": "Nguyễn Thị Mẫu Đơn",
    "info.customerPhone": "0901234567",
    "info.cashierName": "Thu ngân mẫu",
    "info.salespersonName": "NVBH mẫu",
    "info.deliveryDate": "05/05/2026",
    "info.deliveryAddress": "12 Trần Hưng Đạo, Ninh Kiều, Cần Thơ",
    "info.note": "Hóa đơn mẫu dùng để căn chỉnh máy in",

    "policy.title": "Chính sách đổi trả",
    "policy.body":
      "Đổi hàng trong 7 ngày kể từ ngày mua, sản phẩm còn nguyên tem mác và hóa đơn.",
    closingMessage: "Giày MT hân hạnh phục vụ quý khách!",
  },

  numbers: {
    "totals.totalQty": 33,
    "totals.subtotal": 19790000,
    "totals.itemDiscountTotal": 1650000,
    "totals.invoiceDiscountTotal": 200000,
    "totals.voucherDiscount": 100000,
    "totals.deliveryFee": 30000,
    "totals.returnFee": 20000,
    "totals.vatAmount": 150000,
    "totals.grandTotal": 18140000,
    "totals.exchangeOffset": 500000,
    "totals.depositAmount": 1000000,
    "totals.paid": 18220000,
    "totals.change": 80000,
    "totals.keptChange": 5000,
    "totals.forgivenShortage": 2000,
    "totals.debtReduction": 300000,
    "totals.customerDebtIssued": 400000,
    "totals.collectedOnBehalf": 250000,
    "totals.remainingReceivable": 600000,

    "totals.returnGross": 900000,
    "totals.returnDiscount": 90000,
    "totals.returnNet": 810000,

    "totals.pointsRedeemed": 120,
    "totals.pointsDiscountAmount": 120000,
    "totals.pointsEarned": 95,
    "totals.pointsReversed": 15,
    "totals.pointsBalanceAfter": 480,

    "totals.debtBefore": 2000000,
    "totals.debtAfter": 2100000,
  },

  // Mặc định = đúng bộ field hóa đơn bán hàng thường ngày in ra. Field còn lại
  // tắt sẵn để người dùng bật từng cái lên mà xem nó nằm ở đâu trên bill.
  enabled: {
    "store.name": true,
    "store.address": true,
    "store.phone": true,

    invoiceNumber: true,
    issuedAt: true,
    voucherCode: false,
    provisionalNote: false,

    "info.returnForInvoiceRef": false,
    "info.customerName": true,
    "info.customerPhone": true,
    "info.cashierName": true,
    "info.salespersonName": true,
    "info.deliveryDate": false,
    "info.deliveryAddress": false,
    "info.note": true,

    "policy.title": false,
    "policy.body": false,
    closingMessage: true,

    "totals.totalQty": true,
    "totals.subtotal": true,
    "totals.itemDiscountTotal": true,
    "totals.invoiceDiscountTotal": false,
    "totals.voucherDiscount": false,
    "totals.deliveryFee": false,
    "totals.returnFee": false,
    "totals.vatAmount": false,
    "totals.grandTotal": true,
    "totals.exchangeOffset": false,
    "totals.depositAmount": false,
    "totals.paid": true,
    "totals.change": true,
    "totals.keptChange": false,
    "totals.forgivenShortage": false,
    "totals.debtReduction": false,
    "totals.customerDebtIssued": false,
    "totals.collectedOnBehalf": false,
    "totals.remainingReceivable": false,

    "totals.returnGross": false,
    "totals.returnDiscount": false,
    "totals.returnNet": false,

    "totals.pointsRedeemed": false,
    "totals.pointsDiscountAmount": false,
    "totals.pointsEarned": false,
    "totals.pointsReversed": false,
    "totals.pointsBalanceAfter": false,

    "totals.debtBefore": false,
    "totals.debtAfter": false,
  },

  overrides: {},

  lines: [
    {
      id: "sample-line-1",
      name: "Giày thể thao nam da lộn cổ thấp size 42 màu xanh navy",
      qty: 10,
      unitPrice: 1650000,
      lineTotal: 14850000,
      discountLabel: "KM 10 % (1.650.000) - Khách quen",
      note: "",
    },
    {
      id: "sample-line-2",
      name: "Dép quai ngang nữ",
      qty: 11,
      unitPrice: 250000,
      lineTotal: null,
      discountLabel: "",
      note: "",
    },
    {
      id: "sample-line-3",
      name: "Xi đánh giày",
      qty: 12,
      unitPrice: 45000,
      lineTotal: null,
      discountLabel: "",
      note: "Tặng kèm",
    },
  ],

  payments: [
    { id: "sample-payment-1", label: "Tiền mặt", amount: 10220000 },
    { id: "sample-payment-2", label: "Chuyển khoản", amount: 8000000 },
  ],
};

export const SAMPLE_DOC_TYPE_OPTIONS: ReadonlyArray<{
  value: SampleDocType;
  label: string;
}> = [
  { value: "SALE", label: "HÓA ĐƠN (bán hàng)" },
  { value: "PROVISIONAL", label: "HÓA ĐƠN TẠM TÍNH" },
  { value: "RETURN_EXCHANGE", label: "HÓA ĐƠN ĐỔI TRẢ" },
];

/**
 * Nhóm field cho editor nội dung. Thứ tự nhóm bám theo thứ tự các khối trên
 * bill in ra, để người dùng dò từ trên xuống là khớp với tờ giấy trước mặt.
 */
export const SAMPLE_INVOICE_FIELD_GROUPS: readonly SampleFieldGroup[] = [
  {
    title: "Cửa hàng",
    description: "Khối đầu bill, ngay dưới logo.",
    fields: [
      { key: "store.name", label: "Tên cửa hàng", kind: "text", required: true },
      { key: "store.address", label: "Địa chỉ", kind: "text" },
      { key: "store.phone", label: "Số điện thoại", kind: "text" },
    ],
  },
  {
    title: "Hóa đơn",
    fields: [
      {
        key: "invoiceNumber",
        label: "Số hóa đơn",
        kind: "text",
        required: true,
      },
      { key: "issuedAt", label: "Ngày giờ", kind: "datetime", required: true },
      {
        key: "provisionalNote",
        label: "Ghi chú tạm tính",
        kind: "text",
        hint: 'Dòng đậm dưới lời cảm ơn. Chỉ hợp lý khi loại hóa đơn là "TẠM TÍNH".',
      },
    ],
  },
  {
    title: "Thông tin khách & nhân viên",
    description: "Khối dòng chữ dưới số hóa đơn. Bỏ trống là ẩn cả dòng.",
    fields: [
      {
        key: "info.returnForInvoiceRef",
        label: "Trả hàng cho hóa đơn",
        kind: "text",
        slot: true,
      },
      { key: "info.customerName", label: "KH", kind: "text" },
      { key: "info.customerPhone", label: "SĐT", kind: "text" },
      { key: "info.cashierName", label: "NV Thu ngân", kind: "text" },
      { key: "info.salespersonName", label: "NVBH", kind: "text" },
      {
        key: "info.deliveryDate",
        label: "Ngày giao hàng",
        kind: "text",
        slot: true,
      },
      {
        key: "info.deliveryAddress",
        label: "Đ/c giao hàng",
        kind: "text",
        slot: true,
      },
      { key: "info.note", label: "Ghi chú", kind: "text" },
    ],
  },
  {
    title: "Tổng tiền",
    description:
      "Các dòng tự tính lấy từ danh sách hàng hóa và thanh toán; bấm ✎ để nhập số tùy ý.",
    fields: [
      // 5 dòng `derived` bên dưới đều `required`: `InvoiceTotals` khai báo
      // chúng non-optional nên bill luôn in, checkbox tắt sẽ là nút vô tác dụng.
      {
        key: "totals.totalQty",
        label: "Tổng SL mua",
        kind: "int",
        derived: true,
        required: true,
      },
      {
        key: "totals.subtotal",
        label: "Tiền hàng",
        kind: "money",
        derived: true,
        required: true,
        hint: "Tổng SL × ĐG của mọi dòng hàng, TRƯỚC khuyến mãi.",
      },
      {
        key: "totals.itemDiscountTotal",
        label: "KM theo mặt hàng",
        kind: "money",
        hint: 'Khối "Khuyến mãi" hiện khi có ít nhất một trong ba dòng KM/Mã ưu đãi.',
      },
      {
        key: "totals.invoiceDiscountTotal",
        label: "KM theo hóa đơn",
        kind: "money",
        slot: true,
      },
      {
        key: "totals.voucherDiscount",
        label: "Mã ưu đãi",
        kind: "money",
        slot: true,
        hint: 'Mã in trong ngoặc lấy từ field "Mã ưu đãi (voucherCode)" bên dưới.',
      },
      {
        key: "voucherCode",
        label: "Mã ưu đãi (voucherCode)",
        kind: "text",
        slot: true,
      },
      { key: "totals.deliveryFee", label: "Phí giao hàng", kind: "money", slot: true },
      { key: "totals.returnFee", label: "Phí đổi trả", kind: "money" },
      { key: "totals.vatAmount", label: "Thuế GTGT", kind: "money", slot: true },
      {
        key: "totals.grandTotal",
        label: "Tổng thanh toán",
        kind: "money",
        derived: true,
        required: true,
        hint: "Tiền hàng − các dòng giảm giá đang bật + các loại phí đang bật.",
      },
      {
        key: "totals.exchangeOffset",
        label: "Đối trả",
        kind: "money",
        slot: true,
      },
      { key: "totals.depositAmount", label: "Đặt cọc", kind: "money" },
      {
        key: "totals.paid",
        label: "Đã trả (paid)",
        kind: "money",
        derived: true,
        required: true,
        hint: "Tổng các dòng thanh toán. Không in trực tiếp, chỉ dùng để tính tiền thối.",
      },
      {
        key: "totals.change",
        label: "Trả lại khách",
        kind: "money",
        derived: true,
        required: true,
        hint: "Đã trả − Tổng thanh toán.",
      },
      {
        key: "totals.keptChange",
        label: "Khách không lấy tiền thừa",
        kind: "money",
      },
      {
        key: "totals.forgivenShortage",
        label: "Bớt tiền lẻ cho khách",
        kind: "money",
      },
      {
        key: "totals.debtReduction",
        label: "Giảm nợ",
        kind: "money",
        hint: 'Khi bật "Dư nợ trước", số này in lại lần nữa trong khối công nợ với nhãn "Nợ giảm".',
      },
      {
        key: "totals.customerDebtIssued",
        label: "Khách nợ",
        kind: "money",
        hint: 'Khi bật "Dư nợ trước", số này in lại lần nữa trong khối công nợ với nhãn "Nợ tăng".',
      },
      { key: "totals.collectedOnBehalf", label: "Thu hộ", kind: "money", slot: true },
      {
        key: "totals.remainingReceivable",
        label: "Còn phải thu",
        kind: "money",
        slot: true,
      },
    ],
  },
  {
    title: "Trả hàng",
    description: 'Cả khối chỉ hiện khi bật "Giá trị trả lại".',
    fields: [
      { key: "totals.returnGross", label: "Tiền hàng trả lại", kind: "money" },
      { key: "totals.returnDiscount", label: "KM (hàng trả)", kind: "money" },
      { key: "totals.returnNet", label: "Giá trị trả lại", kind: "money" },
    ],
  },
  {
    title: "Công nợ",
    description: 'Cả khối chỉ hiện khi bật "Dư nợ trước".',
    fields: [
      { key: "totals.debtBefore", label: "Dư nợ trước", kind: "money", slot: true },
      { key: "totals.debtAfter", label: "Dư nợ sau", kind: "money", slot: true },
    ],
  },
  {
    title: "Điểm tích lũy",
    fields: [
      {
        key: "totals.pointsRedeemed",
        label: "Số điểm dùng",
        kind: "int",
        hint: 'In thành "Dùng điểm (n)" — giá trị VND của dòng lấy từ ô bên dưới.',
      },
      {
        key: "totals.pointsDiscountAmount",
        label: "Tiền giảm từ điểm",
        kind: "money",
      },
      { key: "totals.pointsEarned", label: "Điểm được tích", kind: "int" },
      { key: "totals.pointsReversed", label: "Điểm trừ", kind: "int" },
      {
        key: "totals.pointsBalanceAfter",
        label: "Số điểm hiện tại",
        kind: "int",
        hint: "Là số dư chứ không phải delta — giá trị 0 VẪN in ra.",
      },
    ],
  },
  {
    title: "Chân bill",
    fields: [
      { key: "policy.title", label: "Tiêu đề chính sách", kind: "text" },
      { key: "policy.body", label: "Nội dung chính sách", kind: "textarea" },
      {
        key: "closingMessage",
        label: "Lời cảm ơn",
        kind: "text",
        required: true,
      },
    ],
  },
];
