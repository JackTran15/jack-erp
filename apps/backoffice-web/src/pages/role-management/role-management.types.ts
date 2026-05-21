import type { Permission, PermissionGroup } from "@erp/shared-interfaces";

export type { RoleDetail, RoleSummary } from "@erp/shared-interfaces";

export type LabeledPermission = Permission & { label: string };

/** Permission group with Vietnamese labels for the role editor UI. */
export type PermissionModuleView = {
  module: PermissionGroup["module"];
  label: string;
  permissions: LabeledPermission[];
};
