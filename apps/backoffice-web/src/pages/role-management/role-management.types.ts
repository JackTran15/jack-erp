export interface RoleRecord {
  id: string;
  name: string;
  description: string;
  permissionIds: string[];
}

export interface RoleFormDraft {
  name: string;
  description: string;
  permissionIds: string[];
}

export interface PermissionItem {
  id: string;
  key: string;
  label: string;
  moduleId: string;
}

export interface PermissionModule {
  id: string;
  label: string;
  permissions: PermissionItem[];
}
