import type { PermissionsCatalogue } from "@erp/shared-interfaces";
import {
  permissionLabelVi,
  permissionModuleLabelVi,
} from "@erp/shared-interfaces";
import type { PermissionModuleView } from "../../pages/role-management/role-management.types";

export {
  PERMISSION_LABELS_VI,
  PERMISSION_MODULE_LABELS_VI,
} from "@erp/shared-interfaces";

export function buildPermissionModules(
  catalogue: PermissionsCatalogue,
): PermissionModuleView[] {
  return catalogue.grouped.map((group) => ({
    module: group.module,
    label: permissionModuleLabelVi(group.module),
    permissions: group.permissions.map((p) => ({
      ...p,
      label: permissionLabelVi(p.key, p.description),
    })),
  }));
}
