import type { Salesperson } from "@erp/pos/interfaces/checkout.interface";
import type { PublicEmployeeRow } from "@erp/pos/interfaces/sales-hierarchy.interface";

/**
 * Map hồ sơ nhân viên (`GET /branches/:id/salesmen`) sang `Salesperson` mà
 * picker dùng. Chốt mapping: id = userId, name = "họ tên", code = mã nhân viên.
 * Fallback name → mã nhân viên → userId khi thiếu họ tên.
 */
export function mapSalesmanToSalesperson(
  row: PublicEmployeeRow,
): Salesperson {
  return {
    id: row.userId,
    name: row.fullName || row.code || row.userId,
    code: row.code,
  };
}
