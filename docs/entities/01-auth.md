# Auth Module Entities

> Handles user identity, role-based access control (RBAC), and permission
> assignment. Users are scoped to an organization; roles and permissions form a
> many-to-many matrix that governs API access.

**Source path:** `apps/api/src/modules/auth/`

---

## UserEntity

**Table:** `users`
**Description:** Represents a human operator who can log in to the system. Each user belongs to exactly one organization and may be assigned to one or more branches. Passwords are stored as bcrypt hashes; the `isActive` flag allows soft-disable without deletion.

**Unique constraints:** `(email, organizationId)` — email is unique per tenant.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, auto-generated | Unique identifier for the user |
| `organizationId` | `organization_id` | `uuid` | NN | Tenant the user belongs to; used for row-level security filtering |
| `email` | `email` | `varchar(255)` | NN | Login email address; unique within the organization |
| `passwordHash` | `password_hash` | `varchar(255)` | NN | Bcrypt hash of the user's password; never exposed via API |
| `firstName` | `first_name` | `varchar(100)` | NN | User's given name, shown in UI and reports |
| `lastName` | `last_name` | `varchar(100)` | NN | User's family name |
| `isActive` | `is_active` | `boolean` | default: `true` | When false, the user cannot log in or perform any action; acts as a soft-delete |
| `lastLoginAt` | `last_login_at` | `timestamptz` | ? | Timestamp of the user's most recent successful authentication |
| `createdAt` | `created_at` | `timestamptz` | auto | Row creation timestamp |
| `updatedAt` | `updated_at` | `timestamptz` | auto | Row last-update timestamp |

**Relations:** None declared directly on the entity. Related via `UserRoleEntity` (roles) and `UserBranchAssignmentEntity` (branches).

---

## RoleEntity

**Table:** `roles`
**Description:** Named authorization role scoped to an organization (e.g. "Admin", "Cashier", "Warehouse Manager"). System-seeded roles have `isSystem = true` and cannot be deleted by users.

**Unique constraints:** `(organizationId, name)` — role names are unique per tenant.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Unique identifier for the role |
| `organizationId` | `organization_id` | `uuid` | NN | Tenant that owns this role |
| `name` | `name` | `varchar(100)` | NN, UQ | Human-readable role name (e.g. "Sales Manager") |
| `description` | `description` | `varchar(500)` | ? | Optional longer explanation of the role's purpose |
| `isSystem` | `is_system` | `boolean` | default: `false` | If true, this role was auto-created during org setup and cannot be deleted |
| `createdAt` | `created_at` | `timestamptz` | auto | Row creation timestamp |
| `updatedAt` | `updated_at` | `timestamptz` | auto | Row last-update timestamp |

---

## PermissionEntity

**Table:** `permissions`
**Description:** Atomic permission (e.g. `inventory.item.create`). Permissions are global (not org-scoped) and seeded at application startup. The `module` field groups permissions for UI display.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Unique identifier |
| `key` | `key` | `varchar(100)` | NN, UQ (globally) | Machine-readable permission key following `module.resource.action` convention |
| `description` | `description` | `varchar(500)` | ? | Human-readable explanation of what this permission allows |
| `module` | `module` | `varchar(100)` | NN | Logical module grouping (e.g. "inventory", "accounting", "pos") |

---

## UserRoleEntity

**Table:** `user_roles`
**Description:** Join table linking a user to a role within an organization. A user can hold multiple roles; each assignment is timestamped.

**Unique constraints:** `(userId, roleId, organizationId)` — prevents duplicate assignment.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Surrogate key for the assignment record |
| `userId` | `user_id` | `uuid` | NN, FK → `users.id` | The user receiving the role |
| `roleId` | `role_id` | `uuid` | NN, FK → `roles.id` | The role being assigned |
| `organizationId` | `organization_id` | `uuid` | NN | Organization context for this assignment |
| `assignedAt` | `assigned_at` | `timestamptz` | auto | When the role was assigned |

---

## RolePermissionEntity

**Table:** `role_permissions`
**Description:** Join table linking a role to a permission. Determines which API actions a role can perform.

**Unique constraints:** `(roleId, permissionId)` — each permission can be granted to a role only once.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Surrogate key |
| `roleId` | `role_id` | `uuid` | NN, FK → `roles.id` | The role receiving the permission |
| `permissionId` | `permission_id` | `uuid` | NN, FK → `permissions.id` | The permission being granted |
