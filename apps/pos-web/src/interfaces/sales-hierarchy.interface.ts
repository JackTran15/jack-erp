/**
 * Entity trả về từ `GET /branches/:id/salesmen` (module sales-hierarchy của API).
 * Mỗi row là một bản ghi gán nhân viên bán hàng vào chi nhánh, kèm thông tin
 * user public. `user` có thể `null` nếu user gán đã bị xoá / không còn trong org.
 */
export interface PublicUserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface SalesmanAssignmentRow {
  id: string;
  userId: string;
  branchId: string;
  organizationId: string;
  assignedAt: string;
  assignedBy: string;
  user: PublicUserRow | null;
}
