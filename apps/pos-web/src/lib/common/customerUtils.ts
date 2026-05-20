import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";

/** Chuẩn hóa số điện thoại: chỉ giữ chữ số. */
export function phoneDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** So khớp lỏng hai số (0xxxx / +84 / khoảng trắng). */
export function phoneNumbersMatch(
  a: string | null | undefined,
  b: string,
): boolean {
  const da = phoneDigitsOnly(a ?? "");
  const db = phoneDigitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const tailA = da.length >= 9 ? da.slice(-9) : da;
  const tailB = db.length >= 9 ? db.slice(-9) : db;
  return tailA === tailB && tailA.length >= 9;
}

export function formatCustomerDisplay(c: Pick<CustomerRow, "name">): string {
  return c.name?.trim() || "Khách";
}

/** Generate a client-side customer code in the shape `KH######`. */
export function generateCustomerCode(): string {
  const seq = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `KH${seq}`;
}
