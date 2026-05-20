import type {
  CreateRoleRequest,
  RoleDetail,
  RoleSummary,
  SetRolePermissionsRequest,
  UpdateRoleRequest,
} from "@erp/shared-interfaces";

/** UI form state for create/edit role (maps to IAM role endpoints). */
export interface RoleFormDraft {
  name: string;
  description: string;
  permissionKeys: string[];
}

export function emptyRoleDraft(): RoleFormDraft {
  return { name: "", description: "", permissionKeys: [] };
}

export function roleToFormDraft(
  role: RoleSummary | RoleDetail,
): RoleFormDraft {
  const permissionKeys =
    "permissionKeys" in role ? [...role.permissionKeys] : [];
  return {
    name: role.name,
    description: role.description ?? "",
    permissionKeys,
  };
}

export function draftToCreateRoleRequest(
  draft: RoleFormDraft,
): CreateRoleRequest {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    permissionKeys: draft.permissionKeys,
  };
}

export function draftToUpdateRoleRequest(
  draft: RoleFormDraft,
  isSystem: boolean,
): UpdateRoleRequest {
  const body: UpdateRoleRequest = {};
  if (!isSystem) {
    body.name = draft.name.trim();
  }
  body.description = draft.description.trim() || undefined;
  return body;
}

export function draftToSetPermissionsRequest(
  draft: RoleFormDraft,
): SetRolePermissionsRequest {
  return { permissionKeys: draft.permissionKeys };
}
