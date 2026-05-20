import { EmploymentStatusEnum } from "./employee.types";

export function employmentStatusFromActive(
  isActive: boolean,
): EmploymentStatusEnum {
  return isActive
    ? EmploymentStatusEnum.OFFICIAL
    : EmploymentStatusEnum.RESIGNED;
}

export function isActiveFromEmploymentStatus(
  status: EmploymentStatusEnum,
): boolean {
  return status !== EmploymentStatusEnum.RESIGNED;
}
