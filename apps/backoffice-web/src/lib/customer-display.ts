/** Nhãn tiếng Việt cho giá trị enum trạng thái khách hàng (API vẫn dùng mã tiếng Anh). */
export const CUSTOMER_STATUS_VI: Record<string, string> = {
  ACTIVE: "Hoạt động",
  INACTIVE: "Ngừng hoạt động",
  MERGED: "Đã gộp",
};

export function formatCustomerStatus(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const s = String(value);
  return CUSTOMER_STATUS_VI[s] ?? s;
}
