/**
 * The document date as printed vouchers spell it: `28 tháng 7 năm 2026`.
 *
 * Deliberately without the leading `Ngày` — that word belongs to the template,
 * not the value, so a renderer can put the date somewhere the word would not
 * fit. Neither day nor month is zero-padded, matching the reference vouchers.
 *
 * Read in the process timezone rather than UTC: a voucher issued at 22:16 local
 * time is dated that day on the paper the storekeeper signs, and shifting it to
 * UTC would print the next day's date on roughly a quarter of the vouchers.
 */
export function toLongVietnameseDate(value: Date): string {
  return `${value.getDate()} tháng ${value.getMonth() + 1} năm ${value.getFullYear()}`;
}
