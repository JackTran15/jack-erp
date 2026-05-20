/**
 * Contract types for the Identity & Access Management API.
 *
 * Endpoint catalogue (all auth-required, organization-scoped):
 *
 *   USERS
 *   GET    /admin/users                              ?page&pageSize&search&isActive  → PaginatedResponse<UserListItem>
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
  code: string | null;
}

export interface UserDetail extends UserSummary {
  roleIds: string[];
  branchIds: string[];
  /** HR profile (1:1). Null when the user has no employee profile yet. */
  profile?: EmployeeProfileView | null;
}

/** Compact employee profile fields surfaced on the user list rows. */
export interface EmployeeProfileSummary {
  code: string;
  /** Inline job position (id + name); null when unset. */
  jobPosition: JobPositionRef | null;
  photoUrl: string | null;
  mobile: string | null;
  employmentStatus: EmploymentStatus;
}

/** A row in the GET /admin/users list: user summary + employee code/profile (null when the user has no profile). */
export interface UserListItem extends UserSummary {
  code: string | null;
  profile: EmployeeProfileSummary | null;
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  /** Whether the account can sign in. Defaults to true on the server when omitted. */
  isActive?: boolean;
  /** Temporary password set by the administrator; user is expected to change it after first login. Min 8 chars. */
  temporaryPassword: string;
  /** Optional initial roles to assign on creation. */
  roleIds?: string[];
  /** Optional initial branch assignments. */
  branchIds?: string[];
  /** Optional HR profile persisted alongside the user account. */
  profile?: EmployeeProfilePayload;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  /** HR profile to upsert. Child collections (addresses/schedule) fully replace the existing set. */
  profile?: EmployeeProfilePayload;
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
// Employee HR profile (1:1 with a user; surfaced through the /admin/users API)
// ---------------------------------------------------------------------------

export enum EmployeeGender {
  MALE = "MALE",
  FEMALE = "FEMALE",
}

export enum MaritalStatus {
  SINGLE = "SINGLE",
  MARRIED = "MARRIED",
}

export enum EmploymentStatus {
  OFFICIAL = "OFFICIAL",
  PROBATION = "PROBATION",
  RESIGNED = "RESIGNED",
}

export enum EmployeeAccessMode {
  FREE = "FREE",
  SCHEDULED = "SCHEDULED",
}

export enum Weekday {
  MONDAY = "MONDAY",
  TUESDAY = "TUESDAY",
  WEDNESDAY = "WEDNESDAY",
  THURSDAY = "THURSDAY",
  FRIDAY = "FRIDAY",
  SATURDAY = "SATURDAY",
  SUNDAY = "SUNDAY",
}

export enum EmployeeAddressType {
  /** Permanent residence (hộ khẩu thường trú). */
  PERMANENT = "PERMANENT",
  /** Current residence (chỗ ở hiện tại). */
  CURRENT = "CURRENT",
}

export interface EmployeeAddressPayload {
  type: EmployeeAddressType;
  address?: string;
  country?: string;
  province?: string;
  district?: string;
  ward?: string;
}

export interface EmployeeEmergencyContactPayload {
  fullName?: string;
  relationship?: string;
  mobile?: string;
  homePhone?: string;
  email?: string;
  address?: string;
}

export interface EmployeeAccessScheduleDayPayload {
  weekday: Weekday;
  enabled: boolean;
  /** "HH:mm" local time. */
  startTime: string;
  /** "HH:mm" local time. */
  endTime: string;
}

/** Reference to a job position, returned inline on the employee profile. */
export interface JobPositionRef {
  id: string;
  name: string;
}

export interface EmployeeProfilePayload {
  /** Employee code, unique per organization (e.g. NV000002). */
  code: string;
  mobile?: string;
  homePhone?: string;
  idCardNumber?: string;
  idCardIssuePlace?: string;
  /** ISO date (YYYY-MM-DD). */
  idCardIssueDate?: string;
  birthDate?: string;
  gender?: EmployeeGender;
  maritalStatus?: MaritalStatus;
  employmentStatus?: EmploymentStatus;
  photoUrl?: string;
  jobPositionId?: string;
  probationDate?: string;
  officialDate?: string;
  salary?: number;
  deposit?: number;
  originalDocumentsNote?: string;
  accessMode?: EmployeeAccessMode;
  addresses?: EmployeeAddressPayload[];
  emergencyContact?: EmployeeEmergencyContactPayload;
  accessSchedule?: EmployeeAccessScheduleDayPayload[];
}

export interface EmployeeAddressView {
  type: EmployeeAddressType;
  address: string | null;
  country: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
}

export interface EmployeeEmergencyContactView {
  fullName: string | null;
  relationship: string | null;
  mobile: string | null;
  homePhone: string | null;
  email: string | null;
  address: string | null;
}

export interface EmployeeAccessScheduleDayView {
  weekday: Weekday;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export interface EmployeeProfileView {
  code: string;
  mobile: string | null;
  homePhone: string | null;
  idCardNumber: string | null;
  idCardIssuePlace: string | null;
  idCardIssueDate: string | null;
  birthDate: string | null;
  gender: EmployeeGender | null;
  maritalStatus: MaritalStatus | null;
  employmentStatus: EmploymentStatus;
  photoUrl: string | null;
  jobPositionId: string | null;
  /** Inline job position (id + name); null when unset. */
  jobPosition: JobPositionRef | null;
  probationDate: string | null;
  officialDate: string | null;
  salary: number;
  deposit: number;
  originalDocumentsNote: string | null;
  accessMode: EmployeeAccessMode;
  addresses: EmployeeAddressView[];
  emergencyContact: EmployeeEmergencyContactView | null;
  accessSchedule: EmployeeAccessScheduleDayView[];
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
  USER_READ: "iam.user.read",
  USER_WRITE: "iam.user.write",
  USER_DELETE: "iam.user.delete",
  ROLE_READ: "iam.role.read",
  ROLE_WRITE: "iam.role.write",
  ROLE_DELETE: "iam.role.delete",
  ROLE_PERMISSIONS_WRITE: "iam.role.permissions.write",
  USER_ROLES_WRITE: "iam.user.roles.write",
  USER_BRANCHES_WRITE: "iam.user.branches.write",
  PERMISSION_READ: "iam.permission.read",
} as const;

export type IamPermissionKey =
  (typeof IAM_PERMISSION_KEYS)[keyof typeof IAM_PERMISSION_KEYS];

export {
  PERMISSION_LABELS_VI,
  PERMISSION_MODULE_LABELS_VI,
  permissionLabelVi,
  permissionModuleLabelVi,
} from "./permission-labels-vi";
