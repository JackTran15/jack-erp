import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";
import type {
  CartLine,
  PaymentMethodOption,
} from "@erp/pos/interfaces/checkout.interface";
import { deriveInvoiceTotals } from "./checkoutSettlement";
import {
  formatLineDiscountLabel,
  lineDiscountAmount,
  lineTotal,
  resolvePaymentMethodLabel,
} from "./checkoutUtils";

/** Receipt number generator: YYMMDD + 4 random digits — e.g. "2605050007". */
function generateInvoiceNumber(d: Date): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  return `${yy}${mm}${dd}${seq}`;
}

const STORE_INFO = {
  name: "Giày MT Cần Thơ",
  address: "95-97 Nguyễn Trãi, Ninh Kiều, Cần Thơ",
  phone: "0834561317",
} as const;

const RETURN_POLICY = {
  title: "QUY ĐỊNH ĐỔI TRẢ",
  body: "Đổi giày đẹp trong 7 ngày (giá trị đổi phải bằng hoặc cao hơn giá sản phẩm trước). Riêng mẫu vớ kiên tất xách, vớ, dây đã không đổi trả. Sản phẩm đổi trả phải còn tem và chưa qua sử dụng.",
} as const;

const CLOSING_MESSAGE = "Giày MT hân hạnh phục vụ quý khách!";

interface BuildCheckoutInvoicePayloadInput {
  printInvoice: boolean;
  cart: CartLine[];
  /** Net "Tổng thanh toán" hiển thị (đã trừ KM dòng, chưa trừ đặt cọc). */
  grandTotal: number;
  /**
   * Net cần tất toán đã trừ đặt cọc (+ phí đổi trả − đổi điểm) = `settlementGrandTotal`.
   * Dùng để derive "Trả lại khách" / "Khách nợ".
   */
  settlementTotal: number;
  /** Tiền đặt cọc — in thành dòng riêng "Đặt cọc" dưới "Tổng thanh toán" khi > 0. */
  deposit: number;
  totalPaid: number;
  paymentLines: PaymentLine[];
  primaryMethodLabel: string;
  methods: readonly PaymentMethodOption[];
  keepChange: boolean;
  /** Matches UI "Tính vào công nợ" (purchase and refund). */
  debt: boolean;
  /** Bản tạm tính (chưa checkout) → renderer in tiêu đề "HÓA ĐƠN TẠM TÍNH". */
  provisional?: boolean;
}

export function buildCheckoutInvoicePayload({
  printInvoice,
  cart,
  grandTotal,
  settlementTotal,
  deposit,
  totalPaid,
  paymentLines,
  primaryMethodLabel,
  methods,
  keepChange,
  debt,
  provisional,
}: BuildCheckoutInvoicePayloadInput): InvoicePayload | null {
  if (!printInvoice || cart.length === 0) return null;

  const totalQty = cart.reduce(
    (sum, l) => sum + (l.isReturnCredit ? Math.abs(l.qty) : l.qty),
    0,
  );
  // "Tiền hàng" = gross trước KM; "Khuyến mãi" = tổng KM theo mặt hàng. Cùng dấu
  // với lineTotal nên grossSubtotal − itemDiscountTotal === grandTotal (net).
  const grossSubtotal = cart.reduce(
    (sum, l) => sum + (l.isReturnCredit ? -1 : 1) * l.unitPrice * l.qty,
    0,
  );
  const itemDiscountTotal = cart.reduce(
    (sum, l) => sum + (l.isReturnCredit ? -1 : 1) * lineDiscountAmount(l),
    0,
  );
  // Bản in phản ánh đúng số khách trả: khi "Tính vào công nợ", phần đã trả (nếu
  // có) hiện ở "Đã trả", phần còn lại dồn vào "Khách nợ" (BE ghi nợ một phần).
  const paid = totalPaid > 0 ? totalPaid : 0;
  const payments =
    totalPaid > 0
      ? paymentLines
          .filter((l) => l.amount > 0)
          .map((l) => ({
            label: resolvePaymentMethodLabel(l.method, methods),
            amount: l.amount,
          }))
      : [{ label: primaryMethodLabel, amount: 0 }];

  // Đặt cọc đã được trừ trong settlementTotal → "Trả lại" / "Khách nợ" đúng.
  const t = deriveInvoiceTotals({
    grandTotal: settlementTotal,
    totalPaid,
    keepChange,
    debt,
  });

  return {
    store: STORE_INFO,
    invoiceNumber: generateInvoiceNumber(new Date()),
    issuedAt: new Date(),
    lines: cart.map((l, i) => ({
      index: i + 1,
      name: l.name,
      qty: l.isReturnCredit ? -l.qty : l.qty,
      unitPrice: l.unitPrice,
      lineTotal: lineTotal(l),
      discountLabel: l.lineDiscount ? formatLineDiscountLabel(l) : undefined,
      note: l.note?.trim() ? l.note.trim() : undefined,
    })),
    totals: {
      totalQty,
      subtotal: grossSubtotal,
      itemDiscountTotal: itemDiscountTotal > 0 ? itemDiscountTotal : undefined,
      grandTotal,
      depositAmount: deposit > 0 ? deposit : undefined,
      paid,
      change: t.change,
      keptChange: t.keptChange,
      forgivenShortage: t.forgivenShortage,
      debtReduction: t.debtReduction,
      customerDebtIssued: t.customerDebtIssued,
    },
    payments,
    provisional,
    policy: RETURN_POLICY,
    closingMessage: CLOSING_MESSAGE,
  };
}

export function calculateDraftTotal(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + lineTotal(line), 0);
}
