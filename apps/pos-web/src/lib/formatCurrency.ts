/** Định dạng tiền theo locale vi-VN (đồng bộ với quy ước ERP/backoffice). */
export function formatCurrencyVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}
