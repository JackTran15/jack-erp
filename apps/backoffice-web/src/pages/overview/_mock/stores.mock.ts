/**
 * Danh sách cửa hàng dùng làm trục X của widget "Doanh thu, chi phí, lợi nhuận".
 * Ở chế độ chi nhánh đơn chỉ có một cột; chế độ chuỗi có nhiều cột.
 */
const CHAIN_STORES = [
  "Kho tổng",
  "CH Nguyễn Trãi",
  "CH Cầu Giấy",
  "CH Quận 1",
  "CH TP. Cà Mau",
] as const;

export function mockStoreNames(scopeKey: string, scopeLabel: string): string[] {
  return scopeKey === "chain" ? [...CHAIN_STORES] : [scopeLabel];
}
