const moneyFormatter = new Intl.NumberFormat("vi-VN");

/** Tiền trong lưới: không kèm ký hiệu ₫, số 0 vẫn hiện "0" (spec §4.3.10). */
export function formatOrderMoney(value: number): string {
  return moneyFormatter.format(value);
}

/** ISO `YYYY-MM-DD` → `DD/MM/YYYY`; ô trống render rỗng hoàn toàn. */
export function formatOrderDate(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}
