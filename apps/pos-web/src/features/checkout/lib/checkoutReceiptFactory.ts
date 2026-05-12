import type { PaymentLine } from "../components/payment/PaymentMethodRow";
import type { InvoicePayload } from "../components/printing/types";
import type {
  CartLine,
  PaymentMethodOption,
} from "../components/types";
import { lineTotal, resolvePaymentMethodLabel } from "./checkoutUtils";

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
  grandTotal: number;
  totalPaid: number;
  paymentLines: PaymentLine[];
  primaryMethodLabel: string;
  methods: readonly PaymentMethodOption[];
  /**
   * Mirrors `useCheckoutPayment.keepChange` — when `true`, the cashier opted
   * to forgive the residual delta ("Khách không lấy tiền thừa" when overpaid
   * or "Bớt tiền lẻ cho khách" when underpaid). Zeroes the receipt's
   * "Trả lại khách" line so the printout matches the on-screen flow.
   */
  keepChange: boolean;
}

export function buildCheckoutInvoicePayload({
  printInvoice,
  cart,
  grandTotal,
  totalPaid,
  paymentLines,
  primaryMethodLabel,
  methods,
  keepChange,
}: BuildCheckoutInvoicePayloadInput): InvoicePayload | null {
  if (!printInvoice || cart.length === 0) return null;

  const totalQty = cart.reduce(
    (sum, l) => sum + (l.isReturnCredit ? Math.abs(l.qty) : l.qty),
    0,
  );
  const paid = totalPaid > 0 ? totalPaid : grandTotal;
  const payments =
    totalPaid > 0
      ? paymentLines
          .filter((l) => l.amount > 0)
          .map((l) => ({
            label: resolvePaymentMethodLabel(l.method, methods),
            amount: l.amount,
          }))
      : [{ label: primaryMethodLabel, amount: grandTotal }];

  // Signed "Trả lại khách":
  //   Sale  (grandTotal >= 0): totalPaid − grandTotal       (positive=change, negative=short)
  //   Refund (grandTotal <  0): max(0, |grandTotal| − totalPaid)  (positive=shop still owes)
  // `keepChange` zeroes it in either direction — see input docs above.
  const rawSignedChange =
    grandTotal < 0
      ? Math.max(0, -grandTotal - totalPaid)
      : totalPaid - grandTotal;
  const change = keepChange ? 0 : rawSignedChange;
  // Echo the forgiven amount on its own labeled row. Only one of these is
  // non-zero at a time (the sale was either over- or under-paid).
  const keptChange =
    keepChange && rawSignedChange > 0 ? rawSignedChange : undefined;
  const forgivenShortage =
    keepChange && rawSignedChange < 0 ? -rawSignedChange : undefined;

  return {
    store: STORE_INFO,
    invoiceNumber: generateInvoiceNumber(new Date()),
    issuedAt: new Date(),
    lines: cart.map((l, i) => ({
      index: i + 1,
      name: l.name,
      qty: l.isReturnCredit ? -l.qty : l.qty,
      unitPrice: l.unitPrice,
    })),
    totals: {
      totalQty,
      subtotal: grandTotal,
      grandTotal,
      paid,
      change,
      keptChange,
      forgivenShortage,
    },
    payments,
    policy: RETURN_POLICY,
    closingMessage: CLOSING_MESSAGE,
  };
}

export function calculateDraftTotal(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + lineTotal(line), 0);
}
