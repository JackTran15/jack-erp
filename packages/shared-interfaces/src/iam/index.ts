/**
 * Contract types for the Identity & Access Management API.
 *
 * Endpoint catalogue (all auth-required, organization-scoped):
 *
 *   USERS
 *   GET    /admin/users                              ?page&pageSize&search&isActive  → PaginatedResponse<UserSummary>
 *   GET    /admin/users/:id                                                          → UserDetail
 *   POST   /admin/users                              body: CreateUserRequest         → UserDetail
 *   PATCH  /admin/users/:id                          body: UpdateUserRequest         → UserDetail
 *   POST   /admin/users/:id/reset-password           body: ResetUserPasswordRequest  → 204
 *   DELETE /admin/users/:id                          (soft delete; isActive=false)   → 204
 *   GET    /admin/users/:id/roles                                                    → UserRolesResponse
 *   POST   /admin/users/:id/roles                    body: SetUserRolesRequest       → UserRolesResponse
 *   GET    /admin/users/:id/branches                                                 → UserBranchesResponse
 *   POST   /admin/users/:id/branches                 body: SetUserBranchesRequest    → UserBranchesResponse
 *
 *   ROLES
 *   GET    /admin/roles                                                              → RoleSummary[]
 *   GET    /admin/roles/:id                                                          → RoleDetail
 *   POST   /admin/roles                              body: CreateRoleRequest         → RoleDetail
 *   PATCH  /admin/roles/:id                          body: UpdateRoleRequest         → RoleDetail
 *   DELETE /admin/roles/:id                                                          → 204
 *   PUT    /admin/roles/:id/permissions              body: SetRolePermissionsRequest → RoleDetail
 *
 *   PERMISSIONS CATALOGUE
 *   GET    /admin/permissions                                                        → PermissionsCatalogue
 */

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserDetail extends UserSummary {
  roleIds: string[];
  branchIds: string[];
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  /** Temporary password set by the administrator; user is expected to change it after first login. Min 8 chars. */
  temporaryPassword: string;
  /** Optional initial roles to assign on creation. */
  roleIds?: string[];
  /** Optional initial branch assignments. */
  branchIds?: string[];
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}

export interface ResetUserPasswordRequest {
  /** New temporary password to set for the user. Min 8 chars. */
  newTemporaryPassword: string;
}

export interface UserListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  /** Pass as `"true"` / `"false"` on the wire. */
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Role assignment on users
// ---------------------------------------------------------------------------

export interface UserRolesResponse {
  roleIds: string[];
}

export interface SetUserRolesRequest {
  /** Replaces the entire role set for the user with this list. */
  roleIds: string[];
}

export interface UserBranchesResponse {
  branchIds: string[];
}

export interface SetUserBranchesRequest {
  /** Replaces the entire branch assignment set for the user with this list. */
  branchIds: string[];
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  /** When true, the role was auto-created during org setup and cannot be renamed/deleted. */
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDetail extends RoleSummary {
  permissionKeys: string[];
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  /** Permission keys to attach when the role is created. May be empty. */
  permissionKeys?: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
}

export interface SetRolePermissionsRequest {
  /** Replaces the entire permission set for the role with this list. */
  permissionKeys: string[];
}

// ---------------------------------------------------------------------------
// Permissions catalogue
// ---------------------------------------------------------------------------

export interface Permission {
  key: string;
  description: string | null;
  module: string;
}

export interface PermissionGroup {
  module: string;
  permissions: Permission[];
}

export interface PermissionsCatalogue {
  permissions: Permission[];
  grouped: PermissionGroup[];
}

// ---------------------------------------------------------------------------
// Permission keys seeded for this module (for FE permission-check helpers)
// ---------------------------------------------------------------------------

export const IAM_PERMISSION_KEYS = {
  USER_READ: 'iam.user.read',
  USER_WRITE: 'iam.user.write',
  USER_DELETE: 'iam.user.delete',
  ROLE_READ: 'iam.role.read',
  ROLE_WRITE: 'iam.role.write',
  ROLE_DELETE: 'iam.role.delete',
  ROLE_PERMISSIONS_WRITE: 'iam.role.permissions.write',
  USER_ROLES_WRITE: 'iam.user.roles.write',
  USER_BRANCHES_WRITE: 'iam.user.branches.write',
  PERMISSION_READ: 'iam.permission.read',
} as const;

export type IamPermissionKey =
  (typeof IAM_PERMISSION_KEYS)[keyof typeof IAM_PERMISSION_KEYS];
