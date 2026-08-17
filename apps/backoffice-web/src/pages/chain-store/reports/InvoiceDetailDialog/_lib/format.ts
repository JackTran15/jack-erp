import { formatViDateTime } from "@erp/ui";

const VND = new Intl.NumberFormat("vi-VN");

/** Số tiền VND không phần thập phân (vd 1.440.000). */
export function formatMoney(value: number | null | undefined): string {
  return VND.format(Math.round(Number(value ?? 0)));
}

/** Số lượng theo vi-VN (giữ phần thập phân nếu có). */
export function formatQuantity(value: number | null | undefined): string {
  return VND.format(Number(value ?? 0));
}

/** Ngày giờ kiểu dd/MM/yyyy HH:mm; rỗng khi không có. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatViDateTime(iso);
}
