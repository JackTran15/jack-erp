# Auth Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **5**

---

## PermissionEntity

- **Table:** `permissions`
- **Source:** `apps/api/src/modules/auth/permission.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Atomic permission seeded at startup (e.g. inventory.item.create). Global, not org-scoped.

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `key` | `key` | `varchar` | NN | Machine-readable permission key following module.resource.action convention |
| `description` | `description` | `varchar` | - | Human-readable explanation of what this permission allows |
| `module` | `module` | `varchar` | NN | Logical module grouping for UI display (e.g. inventory, accounting, pos) |

---

## RoleEntity

- **Table:** `roles`
- **Source:** `apps/api/src/modules/auth/role.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Named authorization role scoped to an organization (e.g. Admin, Cashier).

### Unique Constraints
- `['organizationId', 'name']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `organizationId` | `organization_id` | `uuid` | NN | Tenant that owns this role |
| `name` | `name` | `varchar` | NN | Human-readable role name, unique per org |
| `description` | `description` | `varchar` | - | Optional longer explanation of the roles purpose |
| `isSystem` | `is_system` | `boolean` | NN, default: false | If true, role was auto-created during org setup and cannot be deleted |
| `createdAt` | `created_at` | `varchar` | NN | - |
| `updatedAt` | `updated_at` | `varchar` | NN | - |

---

## RolePermissionEntity

- **Table:** `role_permissions`
- **Source:** `apps/api/src/modules/auth/role-permission.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Join table linking a role to a permission. Determines which API actions a role can perform.

### Unique Constraints
- `['roleId', 'permissionId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `roleId` | `role_id` | `uuid` | NN | The role receiving the permission |
| `permissionId` | `permission_id` | `uuid` | NN | The permission being granted |

---

## UserEntity

- **Table:** `users`
- **Source:** `apps/api/src/modules/auth/user.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Human operator who can authenticate and perform actions in the system.

### Unique Constraints
- `['email', 'organizationId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `organizationId` | `organization_id` | `uuid` | NN | Tenant the user belongs to; used for row-level security filtering |
| `email` | `email` | `varchar` | NN | Login email address; unique within the organization |
| `passwordHash` | `password_hash` | `varchar` | NN | Bcrypt hash of the users password; never exposed via API |
| `firstName` | `first_name` | `varchar` | NN | Users given name, shown in UI and reports |
| `lastName` | `last_name` | `varchar` | NN | Users family name |
| `isActive` | `is_active` | `boolean` | NN, default: true | When false the user cannot log in or perform any action; acts as a soft-delete |
| `lastLoginAt` | `last_login_at` | `timestamptz` | - | Timestamp of the users most recent successful authentication |
| `createdAt` | `created_at` | `varchar` | NN | - |
| `updatedAt` | `updated_at` | `varchar` | NN | - |

---

## UserRoleEntity

- **Table:** `user_roles`
- **Source:** `apps/api/src/modules/auth/user-role.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Join table linking a user to a role within an organization.

### Unique Constraints
- `['userId', 'roleId', 'organizationId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `userId` | `user_id` | `uuid` | NN | The user receiving the role |
| `roleId` | `role_id` | `uuid` | NN | The role being assigned |
| `organizationId` | `organization_id` | `uuid` | NN | Organization context for this assignment |
| `assignedAt` | `assigned_at` | `varchar` | NN | When the role was assigned |

---
