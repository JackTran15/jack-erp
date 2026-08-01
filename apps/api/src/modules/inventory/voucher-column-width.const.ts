/**
 * Column widths for the stock voucher line table, in characters.
 *
 * One table for all three vouchers, because the three column sets overlap
 * almost entirely and three copies of these numbers would be three chances to
 * drift. Characters is the unit `VoucherXlsxWriter` already reads; the printed
 * page normalises the same numbers into percentages (ADR-13), so a column can
 * never be sized for the file and left wrong on paper.
 *
 * Sized to the widest thing each column really holds — which is sometimes the
 * heading, not the data. Measured in Chrome at the true printable width (A4
 * portrait, 10 mm margins → 190 mm) with the voucher's own Times New Roman
 * 13 px, as content millimetres and as the share of 190 mm they imply:
 *
 *     STT         7.3 mm →  5.65%   ("Tổng" on the totals row, not "1")
 *     Mã SKU     32.3 mm → 18.82%   (a 16-character SKU — the binding case)
 *     ĐVT         7.3 mm →  5.65%   (the "ĐVT" heading itself)
 *     Vị trí     11.7 mm →  7.96%
 *     SL         13.1 mm →  8.69%   ("Số lượng", the goods-issue heading)
 *     Đơn giá    13.8 mm →  9.07%   (9.999.999)
 *     Thành tiền 17.2 mm → 10.88%   (999.999.999)
 *     Kho xuất   18.7 mm → 11.68%
 *
 * The numbers below clear every one of those with a few millimetres to spare.
 * "STT", "SL" and "ĐVT" are the narrow ones, as asked, but none can go below
 * its own heading: `SL` is 11 because a goods issue heads that column "Số
 * lượng", and shrinking it further only wraps the heading.
 *
 * A column with `span` gets this width on *each* grid column it covers, so
 * "Tên hàng hóa" totals 32. A long product name still wraps there — that is the
 * one column where wrapping is normal, and the reference printouts wrap it too.
 *
 * Columns nobody asked to change keep a middling width (A-27). Hidden columns
 * are listed for completeness; their width never reaches paper.
 */
export const VOUCHER_COLUMN_WIDTHS: Readonly<Record<string, number>> = {
  stt: 8,
  sku: 26,
  name: 7,
  uom: 8,
  position: 12,
  sourceWarehouse: 16,
  sourcePosition: 13,
  destWarehouse: 16,
  quantity: 11,
  unitPrice: 12,
  lineTotal: 15,
  salePrice: 12,
  saleTotal: 14,
  note: 20,
};
