import { EmployeeRoleCategoryEnum } from "./employee.types";

export const EMPLOYEE_ROLE_CATEGORY_LABELS: Record<
  EmployeeRoleCategoryEnum,
  string
> = {
  [EmployeeRoleCategoryEnum.SALES]: "Bán hàng",
  [EmployeeRoleCategoryEnum.MANAGEMENT]: "Quản lý",
};

/** Legacy picker helpers — roles now come from IAM API in EmployeeRolesFormTab. */
export function getPickerRolesByCategory(_category: EmployeeRoleCategoryEnum) {
  return [] as Array<{ id: string; name: string; description: string }>;
}

export function splitPickerRoleColumns<T>(roles: T[]): [T[], T[]] {
  const mid = Math.ceil(roles.length / 2);
  return [roles.slice(0, mid), roles.slice(mid)];
}
