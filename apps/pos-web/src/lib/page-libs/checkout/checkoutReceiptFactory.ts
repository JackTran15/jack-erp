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
  /** "KH:" trên hóa đơn. */
  customerName?: string | null;
  /** "SĐT:" trên hóa đơn. */
  customerPhone?: string | null;
  /** "NV Thu ngân:" — user đang đăng nhập. */
  cashierName?: string | null;
  /** "NVBH:" — nhân viên bán hàng đã chọn. */
  salespersonName?: string | null;
  /** "Ghi chú:" — ghi chú hóa đơn. */
  note?: string;
  /**
   * Dòng trả trong `cart` (QUICK_EXCHANGE: returnCart — KHÔNG mang
   * `isReturnCredit`; INVOICE_RETURN: purchaseCart lọc `isReturnCredit`).
   * Nhận diện theo `lineId` để tách khối "Tiền hàng trả lại" / đảo dấu dòng in.
   */
  returnLines?: CartLine[];
  /** "Phí đổi trả" — từ payment draft. */
  returnFee?: number;
  /** Số điểm khách dùng — n trong "Điểm (n)". */
  pointsRedeemed?: number;
  /** Tiền giảm từ điểm (VND). */
  pointsDiscountAmount?: number;
  /** Mã voucher đã chọn — renderer chỉ in khi có `voucherDiscount`. */
  voucherCode?: string | null;
}

/** Trim + rỗng → undefined, cho các field info ẩn được trên bản in. */
function trimmedOrUndefined(value?: string | null): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
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
  customerName,
  customerPhone,
  cashierName,
  salespersonName,
  note,
  returnLines,
  returnFee,
  pointsRedeemed,
  pointsDiscountAmount,
  voucherCode,
}: BuildCheckoutInvoicePayloadInput): InvoicePayload | null {
  if (!printInvoice || cart.length === 0) return null;

  // Dòng trả nhận diện theo lineId (returnCart của quick-exchange không mang
  // `isReturnCredit`) — union với flag cho luồng INVOICE_RETURN.
  const returnLineIds = new Set((returnLines ?? []).map((l) => l.lineId));
  const isReturnLine = (l: CartLine): boolean =>
    Boolean(l.isReturnCredit) || returnLineIds.has(l.lineId);
  const purchaseOnly = cart.filter((l) => !isReturnLine(l));
  const returnOnly = cart.filter(isReturnLine);

  const totalQty = cart.reduce(
    (sum, l) => sum + (isReturnLine(l) ? Math.abs(l.qty) : l.qty),
    0,
  );
  // "Tiền hàng" = gross hàng mua trước KM; "Khuyến mãi" = KM theo mặt hàng của
  // hàng mua. Khối trả tách riêng nên purchaseNet − returnNet === grandTotal.
  const grossSubtotal = purchaseOnly.reduce(
    (sum, l) => sum + l.unitPrice * l.qty,
    0,
  );
  const itemDiscountTotal = purchaseOnly.reduce(
    (sum, l) => sum + lineDiscountAmount(l),
    0,
  );
  // Khối "Tiền hàng trả lại / KM / Giá trị trả lại" — độ lớn dương.
  const returnGross = returnOnly.reduce(
    (sum, l) => sum + l.unitPrice * Math.abs(l.qty),
    0,
  );
  const returnDiscount = returnOnly.reduce(
    (sum, l) => sum + lineDiscountAmount(l),
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
    info: {
      customerName: trimmedOrUndefined(customerName),
      customerPhone: trimmedOrUndefined(customerPhone),
      cashierName: trimmedOrUndefined(cashierName),
      salespersonName: trimmedOrUndefined(salespersonName),
      note: trimmedOrUndefined(note),
    },
    voucherCode: trimmedOrUndefined(voucherCode),
    lines: cart.map((l, i) => {
      // lineTotal() chỉ đảo dấu theo isReturnCredit — dòng returnCart của
      // quick-exchange phải đảo tay để in số âm như hàng trả.
      const signedTotal =
        isReturnLine(l) && !l.isReturnCredit ? -lineTotal(l) : lineTotal(l);
      return {
        index: i + 1,
        name: l.name,
        qty: isReturnLine(l) ? -Math.abs(l.qty) : l.qty,
        unitPrice: l.unitPrice,
        lineTotal: signedTotal,
        discountLabel: l.lineDiscount ? formatLineDiscountLabel(l) : undefined,
        note: l.note?.trim() ? l.note.trim() : undefined,
      };
    }),
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
      returnGross: returnOnly.length > 0 ? returnGross : undefined,
      returnDiscount:
        returnOnly.length > 0 && returnDiscount > 0 ? returnDiscount : undefined,
      returnNet:
        returnOnly.length > 0 ? returnGross - returnDiscount : undefined,
      returnFee: returnFee && returnFee > 0 ? returnFee : undefined,
      pointsRedeemed:
        pointsRedeemed && pointsRedeemed > 0 ? pointsRedeemed : undefined,
      pointsDiscountAmount:
        pointsRedeemed && pointsRedeemed > 0 ? pointsDiscountAmount : undefined,
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
