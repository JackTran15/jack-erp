import { EmployeeRoleCategoryEnum, type MockRole } from "./employee.types";
import { MOCK_ROLES } from "./employees.mock";

export const EMPLOYEE_ROLE_CATEGORY_LABELS: Record<
  EmployeeRoleCategoryEnum,
  string
> = {
  [EmployeeRoleCategoryEnum.SALES]: "VAI TRÒ BÁN HÀNG",
  [EmployeeRoleCategoryEnum.MANAGEMENT]: "VAI TRÒ QUẢN LÝ",
};

export function getPickerRolesByCategory(
  category: EmployeeRoleCategoryEnum,
): MockRole[] {
  return MOCK_ROLES.filter((role) => role.category === category);
}

export function splitPickerRoleColumns(
  roles: MockRole[],
): [MockRole[], MockRole[]] {
  const mid = Math.ceil(roles.length / 2);
  return [roles.slice(0, mid), roles.slice(mid)];
}
