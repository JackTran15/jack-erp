import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserDetail,
} from "@erp/shared-interfaces";
import type { EmployeeFormDraft } from "../../pages/employees/employee.types";
import { isActiveFromEmploymentStatus } from "../../pages/employees/employee-status";
import { splitFullName } from "./display";

/** PATCH profile + optional role/branch/password side effects (see useUpdateUser). */
export interface UserUpdatePayload extends UpdateUserRequest {
  roleIds?: string[];
  branchIds?: string[];
  newTemporaryPassword?: string;
}

export function draftToCreateUserRequest(
  draft: EmployeeFormDraft,
): CreateUserRequest {
  const { firstName, lastName } = splitFullName(draft.basic.fullName);
  return {
    email: draft.basic.email.trim(),
    firstName,
    lastName,
    temporaryPassword: draft.basic.password,
    roleIds: draft.roleIds.length > 0 ? draft.roleIds : undefined,
    branchIds:
      (draft.branchIds?.length ?? 0) > 0 ? draft.branchIds : undefined,
  };
}

export function draftToUserUpdatePayload(
  draft: EmployeeFormDraft,
  previous?: Pick<UserDetail, "roleIds" | "branchIds" | "isActive">,
): UserUpdatePayload {
  const { firstName, lastName } = splitFullName(draft.basic.fullName);
  const payload: UserUpdatePayload = { firstName, lastName };

  const isActive = isActiveFromEmploymentStatus(draft.basic.employmentStatus);
  if (previous?.isActive !== isActive) {
    payload.isActive = isActive;
  }

  const prevRoleIds = previous?.roleIds ?? [];
  const roleChanged =
    draft.roleIds.length !== prevRoleIds.length ||
    draft.roleIds.some((id) => !prevRoleIds.includes(id));
  if (roleChanged) {
    payload.roleIds = draft.roleIds;
  }

  const prevBranchIds = previous?.branchIds ?? [];
  const branchIds = draft.branchIds ?? [];
  const branchChanged =
    branchIds.length !== prevBranchIds.length ||
    branchIds.some((id) => !prevBranchIds.includes(id));
  if (branchChanged) {
    payload.branchIds = branchIds;
  }

  if (draft.basic.password.trim()) {
    payload.newTemporaryPassword = draft.basic.password;
  }

  return payload;
}
