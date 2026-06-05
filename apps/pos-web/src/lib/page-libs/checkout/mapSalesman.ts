import type { Salesperson } from "@erp/pos/interfaces/checkout.interface";
import type { PublicEmployeeRow } from "@erp/pos/interfaces/sales-hierarchy.interface";

/**
 * Map hồ sơ nhân viên (`GET /branches/:id/salesmen`) sang `Salesperson` mà
 * picker dùng. Chốt mapping: id = employee profile id (gửi lên BE làm
 * `salespersonId` → FK `invoices.salesperson_id` → `employee_profiles.id`),
 * name = "họ tên", code = mã nhân viên. Fallback name → mã NV → id khi thiếu.
 */
export function mapSalesmanToSalesperson(
  row: PublicEmployeeRow,
): Salesperson {
  return {
    id: row.id,
    name: row.fullName || row.code || row.id,
    code: row.code,
  };
}
