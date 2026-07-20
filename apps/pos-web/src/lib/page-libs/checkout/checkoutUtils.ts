import type { PromoMenuOption } from "@erp/pos/constants/checkout.constant";
import type {
  CartLine,
  CashSuggestion,
  PaymentMethodOption,
} from "@erp/pos/interfaces/checkout.interface";
import type { PaymentMethod } from "@erp/pos/constants/checkout.constant";
import { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";
import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import { PromoMenuOptionEnum } from "@erp/pos/constants/checkout.constant";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { formatVnd } from "@erp/ui";

/** Normalize persisted / loose string into {@link CheckoutVariantEnum}. */
export function coerceCheckoutVariant(raw: unknown): CheckoutVariantEnum {
  if (raw === CheckoutVariantEnum.QUICK_EXCHANGE || raw === "quick_exchange") {
    return CheckoutVariantEnum.QUICK_EXCHANGE;
  }
  if (raw === CheckoutVariantEnum.INVOICE_RETURN || raw === "invoice_return") {
    return CheckoutVariantEnum.INVOICE_RETURN;
  }
  return CheckoutVariantEnum.SALE;
}

export const qtyFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 2,
});

export function formatOnHand(n: number, unit: string): string {
  return `${qtyFormatter.format(n)} ${unit}`.trim();
}

/**
 * Tính tiền giảm KM cho 1 dòng. `percent` → % của gross (làm tròn về số nguyên);
 * `amount` → cố định, cap không vượt gross & không âm. Trả 0 nếu không có KM.
 */
export function lineDiscountAmount(line: CartLine): number {
  const d = line.lineDiscount;
  if (!d) return 0;
  const gross = Math.max(0, line.unitPrice * line.qty);
  if (d.type === "percent") {
    const pct = Math.max(0, Math.min(d.value, 100));
    return Math.round((gross * pct) / 100);
  }
  return Math.min(Math.max(0, d.value), gross);
}

export function lineTotal(line: CartLine): number {
  const base = line.unitPrice * line.qty;
  const net = Math.max(0, base - lineDiscountAmount(line));
  return line.isReturnCredit ? -net : net;
}

/**
 * Nhãn KM dùng chung (dòng cart lẫn item hóa đơn đã lưu): `percent` →
 * "KM {value} % ({tiền giảm}) - {lý do}"; `amount` → "KM {value} - {lý do}".
 */
export function formatDiscountLabel(input: {
  type: "percent" | "amount";
  /** Giá trị KM thô user nhập (10 = 10% hoặc số tiền VNĐ). */
  value: number;
  /** Số tiền giảm (VNĐ) đã tính — chỉ dùng cho nhãn `percent`. */
  amount: number;
  reason: string;
}): string {
  if (input.type === "percent") {
    return `KM ${input.value} % (${formatVnd(input.amount)}) - ${input.reason}`;
  }
  return `KM ${formatVnd(input.value)} - ${input.reason}`;
}

/**
 * Nhãn KM dòng hiển thị/in từ `CartLine`. Trả "" nếu dòng không có KM.
 */
export function formatLineDiscountLabel(line: CartLine): string {
  const d = line.lineDiscount;
  if (!d) return "";
  return formatDiscountLabel({
    type: d.type,
    value: d.value,
    amount: lineDiscountAmount(line),
    reason: d.reason,
  });
}

/**
 * Sale line: qty above on-hand snapshot (`maxQty`) — bán vượt tồn / bán khống.
 * Dòng chưa xác định được tồn (`onHandUnknown`) luôn tính là cần cảnh báo: thà
 * hỏi thừa còn hơn im lặng cho bán khống (BE không chặn tồn âm — xem
 * `stock-ledger.service.ts`, FE là lớp bảo vệ duy nhất).
 */
export function lineExceedsOnHandSnapshot(line: CartLine): boolean {
  if (line.isReturnCredit) return false;
  if (line.onHandUnknown) return true;
  return line.qty > line.maxQty;
}

export function getOversellSaleLines(lines: CartLine[]): CartLine[] {
  return lines.filter(lineExceedsOnHandSnapshot);
}

/** Cảnh báo SL: bán vượt tồn hoặc hoàn vượt SL được phép trên hóa đơn gốc (`maxQty`). */
export function isCartLineWarning(line: CartLine): boolean {
  if (line.onHandUnknown) return true;
  return line.qty > line.maxQty;
}

export function paymentLabel(m: PaymentMethod): string {
  switch (m) {
    case PaymentMethodEnum.CASH:
      return "tiền mặt";
    case PaymentMethodEnum.CARD:
      return "thẻ";
    case PaymentMethodEnum.TRANSFER:
      return "chuyển khoản";
    default:
      return m;
  }
}

export function promoOptionLabel(option: PromoMenuOption): string {
  switch (option) {
    case PromoMenuOptionEnum.PROMO:
      return "mã ưu đãi";
    case PromoMenuOptionEnum.VOUCHER:
      return "voucher";
    case PromoMenuOptionEnum.DISCOUNT:
      return "khuyến mãi";
    default:
      return option;
  }
}

export function customerSearchErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (m.startsWith("HTTP 403")) {
      return "Không có quyền tìm khách (customer.read).";
    }
    if (m.startsWith("HTTP 401")) {
      return "Phiên hết hạn. Đăng nhập lại.";
    }
    return m.replace(/^HTTP \d+: /, "").slice(0, 300) || "Đã xảy ra lỗi.";
  }
  return "Lỗi không xác định.";
}

export function buildSuggestions(amountDue: number): CashSuggestion[] {
  if (amountDue <= 0) return [];
  return [
    { id: "exact", amount: amountDue },
    { id: "plus-1k", amount: amountDue + 1_000 },
    { id: "plus-10k", amount: amountDue + 10_000 },
  ];
}

export function matchesCatalogQuery(
  product: Pick<PosCatalogLine, "name" | "code">,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return (
    product.name.toLowerCase().includes(normalizedQuery) ||
    product.code.toLowerCase().includes(normalizedQuery)
  );
}

export function resolvePaymentMethodLabel(
  method: PaymentMethod,
  methods: readonly PaymentMethodOption[],
): string {
  return methods.find((opt) => opt.value === method)?.label ?? String(method);
}
