import { INVOICE_PAYMENT_METHOD_LABEL } from "@erp/pos/constants/checkout.constant";
import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
import type { InvoiceStoreInfo } from "@erp/pos/interfaces/invoice-printing.interface";
import { getInvoiceSignedTotal } from "@erp/pos/lib/common/invoiceAmount";

/**
 * Dựng payload in từ một hoá đơn **đã lưu** (`GET /invoices/:id`).
 *
 * Khác `buildCheckoutInvoicePayload`: hàm kia dựng từ state giỏ hàng đang
 * thanh toán và tự sinh số hoá đơn; ở đây mọi con số đã chốt trên server, nên
 * chỉ ánh xạ lại — không tính lại tiền, không sinh số mới.
 *
 * Cột `numeric` của Postgres về FE ở dạng string, nên mọi số đều phải qua
 * `Number()` trước khi cộng.
 *
 * Dấu của hàng trả nằm ở `item.direction`, KHÔNG ở con số: DB lưu `quantity` và
 * `lineTotal` luôn dương. Mọi phép chia dòng dưới đây phải đi qua `isReturnLine`,
 * và các con số phải khớp từng đồng với `checkoutReceiptFactory` (đường in lúc
 * thanh toán) — hai đường in cùng một hoá đơn thì phải ra cùng một tờ.
 */
export function buildInvoiceRowPrintPayload(
  invoice: InvoiceRow,
  options: {
    store?: InvoiceStoreInfo;
    cashierName?: string;
    copies?: number;
  } = {},
): InvoicePayload {
  const items = invoice.items ?? [];
  const isReturnExchange = invoice.type === "RETURN" || invoice.type === "EXCHANGE";

  const isReturnLine = (item: (typeof items)[number]): boolean =>
    item.direction === "IN";
  const purchaseOnly = items.filter((item) => !isReturnLine(item));
  const returnOnly = items.filter(isReturnLine);

  const qtyOf = (item: (typeof items)[number]) =>
    Math.abs(Number(item.quantity) || 0);
  const grossOf = (item: (typeof items)[number]) =>
    (Number(item.unitPrice) || 0) * qtyOf(item);
  const discountOf = (item: (typeof items)[number]) =>
    Number(item.lineDiscount) || 0;

  // `checkoutReceiptFactory` cộng cả hàng trả (theo trị tuyệt đối) vào "Tổng SL
  // mua". Giữ nguyên cách đó để hai đường in khớp nhau; sửa nhãn/ngữ nghĩa là
  // việc riêng, và phải sửa ở cả hai chỗ cùng lúc.
  const totalQty = items.reduce((sum, item) => sum + qtyOf(item), 0);
  // "Tiền hàng" và "Khuyến mãi" chỉ tính hàng mua — khối hàng trả tách riêng
  // bên dưới, nên purchaseNet − returnNet === grandTotal.
  const subtotal = purchaseOnly.reduce((sum, item) => sum + grossOf(item), 0);
  const itemDiscountTotal = purchaseOnly.reduce(
    (sum, item) => sum + discountOf(item),
    0,
  );
  // Khối "Tiền hàng trả lại / KM / Giá trị trả lại" — độ lớn dương.
  const returnGross = returnOnly.reduce((sum, item) => sum + grossOf(item), 0);
  const returnDiscount = returnOnly.reduce(
    (sum, item) => sum + discountOf(item),
    0,
  );

  const paymentRows = invoice.payments ?? [];
  const payments =
    paymentRows.length > 0
      ? paymentRows.map((p) => ({
          label: INVOICE_PAYMENT_METHOD_LABEL[p.paymentMethod],
          amount: Number(p.amount) || 0,
        }))
      : invoice.paymentMethod
        ? [
            {
              label: INVOICE_PAYMENT_METHOD_LABEL[invoice.paymentMethod],
              amount: Number(invoice.totalPaid) || 0,
            },
          ]
        : [];

  const depositAmount = Number(invoice.depositAmount) || 0;
  const pointsRedeemed = Number(invoice.pointsRedeemed) || 0;
  const pointsEarned = Number(invoice.pointsEarned) || 0;
  const pointsReversed = Number(invoice.pointsReversed) || 0;
  const remainingDebt = Number(invoice.remainingDebt) || 0;

  return {
    store: options.store ?? {
      name: invoice.branch?.name ?? "",
      address: "",
      phone: "",
    },
    // Số hoá đơn thật do document-numbering cấp — không sinh lại.
    invoiceNumber: invoice.code,
    issuedAt: new Date(invoice.issuedAt ?? invoice.createdAt),
    info: {
      customerName: invoice.customer?.name?.trim() || undefined,
      customerPhone: invoice.customer?.phone?.trim() || undefined,
      cashierName:
        options.cashierName?.trim() || invoice.staffName?.trim() || undefined,
      note: invoice.note?.trim() || undefined,
    },
    lines: items.map((item, index) => {
      const returned = isReturnLine(item);
      const lineTotal = Math.abs(Number(item.lineTotal) || 0);
      return {
        index: index + 1,
        name: item.itemName,
        qty: returned ? -qtyOf(item) : qtyOf(item),
        unitPrice: Number(item.unitPrice) || 0,
        lineTotal: returned ? -lineTotal : lineTotal,
        note: item.note?.trim() || undefined,
      };
    }),
    totals: {
      totalQty,
      subtotal,
      itemDiscountTotal: itemDiscountTotal > 0 ? itemDiscountTotal : undefined,
      // `amountDue` bị BE clamp về 0 với đơn trả (checkout-return.service.ts),
      // nên phải đọc qua helper — cùng nguồn mà cột "Tổng thanh toán" của danh
      // sách hoá đơn đang dùng.
      grandTotal: getInvoiceSignedTotal(invoice),
      depositAmount: depositAmount > 0 ? depositAmount : undefined,
      paid: Number(invoice.totalPaid) || 0,
      change: 0,
      // Phần chưa thu của hoá đơn công nợ — in để khách biết còn nợ bao nhiêu.
      customerDebtIssued: remainingDebt > 0 ? remainingDebt : undefined,
      // Khối trả ẩn hoàn toàn khi `returnNet` là undefined — hoá đơn bán không
      // có dòng IN nào nên đi đúng đường cũ.
      returnGross: returnOnly.length > 0 ? returnGross : undefined,
      returnDiscount:
        returnOnly.length > 0 && returnDiscount > 0 ? returnDiscount : undefined,
      returnNet:
        returnOnly.length > 0 ? returnGross - returnDiscount : undefined,
      pointsRedeemed: pointsRedeemed > 0 ? pointsRedeemed : undefined,
      pointsDiscountAmount:
        pointsRedeemed > 0
          ? Number(invoice.pointsDiscountAmount) || 0
          : undefined,
      pointsEarned: pointsEarned > 0 ? pointsEarned : undefined,
      pointsReversed: pointsReversed > 0 ? pointsReversed : undefined,
      // Số dư chứ không phải delta: `0` là giá trị hợp lệ nên KHÔNG dùng
      // `Number(x) || 0` như các dòng trên — chỉ null/undefined mới ẩn dòng.
      pointsBalanceAfter: invoice.pointsBalanceAfter ?? undefined,
    },
    payments,
    isReturnExchange,
    copies: options.copies && options.copies > 1 ? options.copies : undefined,
    policy: { title: "", body: "" },
    closingMessage: "Giày MT hân hạnh phục vụ quý khách!",
  };
}
