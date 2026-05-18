import type { PromoMenuOption } from "@erp/pos/constants/checkout.constant";
import type {
  CartLine,
  CashSuggestion,
  PaymentMethod,
  PaymentMethodOption,
} from "./checkout.types";
import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import { PromoMenuOptionEnum } from "@erp/pos/constants/checkout.constant";
import type { PosCatalogLine } from "@erp/pos/lib/page-libs/checkout/posCatalogApi";

export const qtyFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 2,
});

export function formatOnHand(n: number, unit: string): string {
  return `${qtyFormatter.format(n)} ${unit}`.trim();
}

export function locationQtyFor(product: PosCatalogLine): number {
  return (
    product.locations.find((l) => l.locationId === product.defaultLocationId)
      ?.quantity ?? 0
  );
}

export function lineTotal(line: CartLine): number {
  const base = line.unitPrice * line.qty;
  return line.isReturnCredit ? -base : base;
}

/** Sale line: qty above on-hand snapshot (`maxQty`) — bán vượt tồn / bán khống. */
export function lineExceedsOnHandSnapshot(line: CartLine): boolean {
  return Boolean(!line.isReturnCredit && line.qty > line.maxQty);
}

export function getOversellSaleLines(lines: CartLine[]): CartLine[] {
  return lines.filter(lineExceedsOnHandSnapshot);
}

/** Cảnh báo SL: bán vượt tồn hoặc hoàn vượt SL được phép trên hóa đơn gốc (`maxQty`). */
export function isCartLineWarning(line: CartLine): boolean {
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
