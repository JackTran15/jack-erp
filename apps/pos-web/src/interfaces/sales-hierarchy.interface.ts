/**
 * Entity trả về từ `GET /branches/:id/salesmen` và `/sales-managers`
 * (module sales-hierarchy của API). Mỗi row là một hồ sơ nhân viên public
 * trong tổ chức — danh sách dùng làm nguồn chọn nhân viên bán hàng. `branchId`
 * trên path chỉ để kiểm soát quyền theo chi nhánh, không lọc kết quả.
 */
export interface PublicEmployeeRow {
  id: string;
  userId: string;
  code: string;
  fullName: string;
  jobPosition: string | null;
  mobile: string | null;
}
