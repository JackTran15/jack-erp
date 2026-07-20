/** Định dạng số tiền / giá theo vi-VN (phân tách hàng nghìn, ví dụ 1.000.000). */

const moneyFormatter = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Chuỗi hiển thị số nguyên (VND): chỉ chữ số, bỏ dấu phân tách khi gõ/dán.
 */
export function parseMoneyIntegerString(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * Số tiền có thể tới từ API dưới dạng chuỗi (cột `numeric` của Postgres trả về
 * string), nên phải ép kiểu trước khi kiểm tra — `Number.isFinite("55555.00")`
 * là `false` và trước đây khiến ô số tiền hiển thị rỗng.
 */
export function formatMoneyInteger(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return moneyFormatter.format(Math.trunc(n));
}

/** Format integer VND (Vietnamese grouping with `.`), no currency symbol. */
export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount));
}