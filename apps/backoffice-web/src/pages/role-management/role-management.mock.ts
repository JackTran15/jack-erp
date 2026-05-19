import { INITIAL_EMPLOYEES } from "../employees/employees.mock";
import type { Employee } from "../employees/employee.types";
import { ALL_PERMISSION_ITEMS } from "./permission-catalog";
import type { RoleFormDraft, RoleRecord } from "./role-management.types";

/** Ba cấp phân quyền theo giai đoạn triển khai đầu tiên */
export const ROLE_IDS = {
  ORG_MANAGER: "role-org-manager",
  BRANCH_MANAGER: "role-branch-manager",
  STAFF: "role-staff",
} as const;

const MOCK_RBAC_ROLES: Omit<RoleRecord, "permissionIds">[] = [
  {
    id: ROLE_IDS.ORG_MANAGER,
    name: "Quản lý tổng",
    description:
      "Toàn quyền truy cập và thao tác trên toàn bộ hệ thống. Xem báo cáo tổng hợp toàn doanh nghiệp và báo cáo của từng chi nhánh.",
  },
  {
    id: ROLE_IDS.BRANCH_MANAGER,
    name: "Quản lý chi nhánh",
    description:
      "Toàn quyền thao tác trong phạm vi chi nhánh được phân công. Xem báo cáo của chi nhánh phụ trách.",
  },
  {
    id: ROLE_IDS.STAFF,
    name: "Nhân viên",
    description:
      "Lên đơn hàng; Xuất / trả hàng từ kho tạm; In hóa đơn, truy cập danh sách hóa đơn tạm; Bắt đầu ca / Kết thúc ca làm việc; Tạo phiếu yêu cầu điều chuyển hàng hóa giữa các kho.",
  },
];

const BRANCH_MANAGER_PERMISSION_KEYS = [
  "customer.read",
  "customer.write",
  "branch.read",
  "product.read",
  "product.write",
  "inventory.read",
  "inventory.write",
  "inventory.item.read",
  "inventory.item.write",
  "inventory.storage.read",
  "inventory.storage.write",
  "inventory.purchase-order.read",
  "inventory.purchase-order.create",
  "inventory.purchase-order.receive",
  "inventory.goods-issue.read",
  "inventory.goods-issue.create",
  "inventory.transfer.read",
  "inventory.transfer.create",
  "inventory.transfer.post",
  "inventory.temp-warehouse.read",
  "inventory.temp-warehouse.write",
  "inventory.manage",
  "goods_receipt.read",
  "goods_receipt.write",
  "pos.invoice.read",
  "pos.invoice.write",
  "pos.sale.create",
  "pos.return.create",
  "pos.session.manage",
  "pos.promotion.read",
  "pos.promotion.write",
  "accounting.cash.read",
  "accounting.expenses.read",
  "reporting.dashboard.branch.read",
  "crud.entity.read",
  "crud.entity.create",
  "crud.entity.update",
];

const STAFF_PERMISSION_KEYS = [
  "customer.read",
  "product.read",
  "pos.sale.create",
  "pos.invoice.read",
  "pos.invoice.write",
  "pos.return.create",
  "pos.session.manage",
  "inventory.temp-warehouse.read",
  "inventory.temp-warehouse.write",
  "inventory.transfer.read",
  "inventory.transfer.create",
];

function keysToPermissionIds(keys: string[]): string[] {
  return keys
    .map((key) => ALL_PERMISSION_ITEMS.find((p) => p.key === key)?.id)
    .filter((id): id is string => Boolean(id));
}

const DEFAULT_PERMISSION_IDS: Record<string, string[]> = {
  [ROLE_IDS.ORG_MANAGER]: ALL_PERMISSION_ITEMS.map((p) => p.id),
  [ROLE_IDS.BRANCH_MANAGER]: keysToPermissionIds(BRANCH_MANAGER_PERMISSION_KEYS),
  [ROLE_IDS.STAFF]: keysToPermissionIds(STAFF_PERMISSION_KEYS),
};

/** Gán nhân viên mẫu vào 3 vai trò (theo id nhân viên) */
const EMPLOYEE_ROLE_ASSIGNMENTS: Record<string, string[]> = {
  "emp-1": [ROLE_IDS.ORG_MANAGER],
  "emp-2": [ROLE_IDS.BRANCH_MANAGER],
  "emp-3": [ROLE_IDS.STAFF],
  "emp-5": [ROLE_IDS.STAFF],
};

function roleRef(role: Omit<RoleRecord, "permissionIds">) {
  return { id: role.id, name: role.name, description: role.description };
}

export function buildInitialRoles(): RoleRecord[] {
  return MOCK_RBAC_ROLES.map((role) => ({
    ...role,
    permissionIds: DEFAULT_PERMISSION_IDS[role.id] ?? [],
  }));
}

export function buildInitialRoleEmployees(): Employee[] {
  const rolesById = new Map(
    buildInitialRoles().map((r) => [r.id, roleRef(r)]),
  );

  return INITIAL_EMPLOYEES.map((emp) => {
    const roleIds = EMPLOYEE_ROLE_ASSIGNMENTS[emp.id] ?? [];
    const roles = roleIds
      .map((id) => rolesById.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    return { ...emp, roles };
  });
}

export function roleToDraft(role: RoleRecord): RoleFormDraft {
  return {
    name: role.name,
    description: role.description,
    permissionIds: [...role.permissionIds],
  };
}

export function draftToRole(
  draft: RoleFormDraft,
  existingId: string,
): RoleRecord {
  return {
    id: existingId,
    name: draft.name.trim(),
    description: draft.description.trim(),
    permissionIds: [...draft.permissionIds],
  };
}
