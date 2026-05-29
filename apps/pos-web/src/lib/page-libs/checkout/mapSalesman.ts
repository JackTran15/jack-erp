import type { Salesperson } from "@erp/pos/interfaces/checkout.interface";
import type { SalesmanAssignmentRow } from "@erp/pos/interfaces/sales-hierarchy.interface";

/**
 * Map bản ghi gán nhân viên (`GET /branches/:id/salesmen`) sang `Salesperson`
 * mà picker dùng. Chốt mapping: id = userId, name = "họ tên", code = email.
 * Fallback name → email → userId khi thiếu thông tin user.
 */
export function mapSalesmanToSalesperson(
  row: SalesmanAssignmentRow,
): Salesperson {
  const fullName = [row.user?.firstName, row.user?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    id: row.userId,
    name: fullName || row.user?.email || row.userId,
    code: row.user?.email ?? "",
  };
}
