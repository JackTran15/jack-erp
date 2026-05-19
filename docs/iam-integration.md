# IAM API Integration Guide

This guide is for frontend developers integrating the Identity & Access Management endpoints in `apps/backoffice-web`. It covers the three workflows the API supports:

1. Account creation and lifecycle (admin creates user, resets password, deactivates)
2. Role + permission management (define roles, grant permissions)
3. Role/branch assignment to users

Contract source of truth: [`packages/shared-interfaces/src/iam/index.ts`](../packages/shared-interfaces/src/iam/index.ts). All TypeScript types in this guide are importable from `@erp/shared-interfaces`.

---

## 1. Setup

### Imports

```ts
import { erpApi, requireErpData, requireErpSuccess } from "../lib/erp-api";

import type {
  // Users
  UserSummary,
  UserDetail,
  CreateUserRequest,
  UpdateUserRequest,
  ResetUserPasswordRequest,
  UserListQuery,
  // Assignments
  UserRolesResponse,
  SetUserRolesRequest,
  UserBranchesResponse,
  SetUserBranchesRequest,
  // Roles
  RoleSummary,
  RoleDetail,
  CreateRoleRequest,
  UpdateRoleRequest,
  SetRolePermissionsRequest,
  // Permissions
  PermissionsCatalogue,
  // Shared
  PaginatedResponse,
} from "@erp/shared-interfaces";

import { IAM_PERMISSION_KEYS } from "@erp/shared-interfaces";
```

### Required headers

The shared axios client (`apps/backoffice-web/src/lib/api-axios.ts`) already injects:

- `Authorization: Bearer <access token>` (auto-refresh on 401)
- `X-Branch-Id: <active branch>`
- `X-Request-Id: <uuid>` (per call)
- `X-Idempotency-Key: <uuid>` (per non-GET call)

No additional wiring needed — call the endpoints through `erpApi.*` and the headers are added automatically.

### Permission-gating UI

Before showing menu entries or action buttons, check the user's permissions:

```ts
import { hasPermission } from "../lib/permissions";
import { IAM_PERMISSION_KEYS } from "@erp/shared-interfaces";

const canManageUsers = hasPermission(IAM_PERMISSION_KEYS.USER_WRITE);
const canEditRoles = hasPermission(IAM_PERMISSION_KEYS.ROLE_WRITE);
const canGrantPermissions = hasPermission(
  IAM_PERMISSION_KEYS.ROLE_PERMISSIONS_WRITE,
);
```

The full list of permission constants is in `IAM_PERMISSION_KEYS` (see `packages/shared-interfaces/src/iam/index.ts`).

---

## 2. Workflow A — Creating an Account

### Endpoint

`POST /admin/users` → `UserDetail`

### TanStack Query mutation

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateUserRequest) =>
      requireErpData(
        await erpApi.POST<UserDetail>("/admin/users", { body }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "users"] });
    },
  });
}
```

### Required fields

| Field               | Notes                                                  |
| ------------------- | ------------------------------------------------------ |
| `email`             | Unique within the organization                         |
| `firstName`         | 1–100 chars                                            |
| `lastName`          | 1–100 chars                                            |
| `temporaryPassword` | 8–72 chars; user should change after first login       |
| `roleIds`           | Optional; UUIDs must belong to the same organization   |
| `branchIds`         | Optional; UUIDs must belong to the same organization   |

### Errors to surface to the user

| Status | Cause                                              | Suggested toast text                                   |
| ------ | -------------------------------------------------- | ------------------------------------------------------ |
| 400    | One of `roleIds` / `branchIds` not in the org      | "Vai trò hoặc chi nhánh không thuộc tổ chức này"       |
| 409    | Email already exists in the organization           | "Email đã được sử dụng trong tổ chức"                  |
| 403    | Caller lacks `iam.user.write`                      | "Bạn không có quyền tạo người dùng"                    |

After creation, the new user's permission cache is invalidated server-side, so any role grants take effect on the user's **next** request.

---

## 3. Workflow B — Listing and Inspecting Users

### Endpoints

- `GET /admin/users?page&pageSize&search&isActive` → `PaginatedResponse<UserSummary>`
- `GET /admin/users/:id` → `UserDetail` (incl. current `roleIds`, `branchIds`)

### Query

```ts
export interface UserListFilters {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
}

export function useUsers(filters: UserListFilters) {
  return useQuery({
    queryKey: ["iam", "users", filters],
    queryFn: async () => {
      const query: Record<string, string | number> = {
        page: filters.page,
        pageSize: filters.pageSize,
      };
      if (filters.search) query.search = filters.search;
      if (typeof filters.isActive === "boolean") {
        query.isActive = String(filters.isActive); // sent as "true" / "false"
      }
      return requireErpData(
        await erpApi.GET<PaginatedResponse<UserSummary>>("/admin/users", {
          params: { query },
        }),
      );
    },
    placeholderData: (prev) => prev,
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ["iam", "user", id],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<UserDetail>("/admin/users/{id}", {
          params: { path: { id: id! } },
        }),
      ),
    enabled: Boolean(id),
  });
}
```

**Search** is server-side ILIKE on `email`, `firstName`, `lastName` (OR-combined).

**Pagination** caps at whatever you pass; `total` is the unfiltered match count.

---

## 4. Workflow C — Updating Profile + Toggling Status

### Endpoints

- `PATCH /admin/users/:id` (`UpdateUserRequest`) → `UserDetail`
- `DELETE /admin/users/:id` → 204 (soft delete: sets `isActive=false`)
- Reactivate by `PATCH` with `{ isActive: true }`.

### Notes

- The administrator **cannot** deactivate their own account (server returns 400).
- Soft-delete preserves the row to keep FK integrity with audit data (journal entries, invoices, etc.).
- Deactivation invalidates the user's permission cache immediately — they will be rejected on their next request.

```ts
export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateUserRequest) =>
      requireErpData(
        await erpApi.PATCH<UserDetail>("/admin/users/{id}", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "users"] });
      void qc.invalidateQueries({ queryKey: ["iam", "user", id] });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/admin/users/{id}", {
          params: { path: { id } },
        }),
      ),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ["iam", "users"] });
      void qc.invalidateQueries({ queryKey: ["iam", "user", id] });
    },
  });
}
```

---

## 5. Workflow D — Resetting a User's Password

### Endpoint

`POST /admin/users/:id/reset-password` (`ResetUserPasswordRequest`) → 204

```ts
export function useResetUserPassword(id: string) {
  return useMutation({
    mutationFn: async (newTemporaryPassword: string) =>
      requireErpSuccess(
        await erpApi.POST("/admin/users/{id}/reset-password", {
          params: { path: { id } },
          body: { newTemporaryPassword } satisfies ResetUserPasswordRequest,
        }),
      ),
  });
}
```

The administrator types the new temporary password. The user changes it themselves after the next login (frontend should prompt; the backend does not yet enforce a "force change" flag).

---

## 6. Workflow E — Assigning Roles to a User

### Endpoints

- `GET /admin/users/:id/roles` → `UserRolesResponse` (`{ roleIds: string[] }`)
- `POST /admin/users/:id/roles` (`SetUserRolesRequest`) → `UserRolesResponse`

**Semantics:** `POST` **replaces** the full role set. Send the complete desired list, not a delta. Use this for a "save changes" button after a multi-select / checkbox UI.

```ts
export function useSetUserRoles(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleIds: string[]) =>
      requireErpData(
        await erpApi.POST<UserRolesResponse>("/admin/users/{id}/roles", {
          params: { path: { id } },
          body: { roleIds } satisfies SetUserRolesRequest,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "user", id] });
    },
  });
}
```

**Error cases:**

- 400: one or more `roleIds` don't belong to the actor's organization.
- 404: user not found.

After save, the user's permission cache is invalidated. Effects take hold on their next request.

---

## 7. Workflow F — Assigning Branches to a User

Same shape as roles, but on `/branches`:

- `GET /admin/users/:id/branches` → `UserBranchesResponse`
- `POST /admin/users/:id/branches` (`SetUserBranchesRequest`) → `UserBranchesResponse`

Branches drive the `X-Branch-Id` header allow-list (see `apps/api/src/modules/rbac/branch-scope.guard.ts`). Without at least one branch, a user can read org-level data but cannot exercise endpoints decorated with `@RequireBranchScope()`.

To list available branches for the picker, call the existing branches endpoint:

```ts
const { data: branches } = useQuery({
  queryKey: ["branches", "all"],
  queryFn: async () =>
    requireErpData(
      await erpApi.GET<PaginatedResponse<Branch>>("/branches", {
        params: { query: { page: 1, pageSize: 200 } },
      }),
    ),
});
```

---

## 8. Workflow G — Listing & Creating Roles

### Endpoints

- `GET /admin/roles` → `RoleSummary[]`
- `GET /admin/roles/:id` → `RoleDetail` (incl. `permissionKeys[]`)
- `POST /admin/roles` (`CreateRoleRequest`) → `RoleDetail`
- `PATCH /admin/roles/:id` (`UpdateRoleRequest`) → `RoleDetail`
- `DELETE /admin/roles/:id` → 204

```ts
export function useRoles() {
  return useQuery({
    queryKey: ["iam", "roles"],
    queryFn: async () =>
      requireErpData(await erpApi.GET<RoleSummary[]>("/admin/roles")),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateRoleRequest) =>
      requireErpData(await erpApi.POST<RoleDetail>("/admin/roles", { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "roles"] });
    },
  });
}
```

### System role rules

If `role.isSystem === true`:

- Renames are blocked (400 from server). Disable the name input.
- Deletion is blocked (400). Hide the delete button.
- Description and permission grants are still editable.

System roles are auto-created during organization setup.

---

## 9. Workflow H — Granting Permissions to a Role

### Endpoint

`PUT /admin/roles/:id/permissions` (`SetRolePermissionsRequest`) → `RoleDetail`

**Semantics:** replaces the full permission set on the role. Send the entire desired list.

### Fetching the permissions catalogue

`GET /admin/permissions` → `PermissionsCatalogue` returns both a flat list and a `grouped` list (one entry per `module`), suitable for a grouped checkbox UI.

```ts
export function usePermissions() {
  return useQuery({
    queryKey: ["iam", "permissions"],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PermissionsCatalogue>("/admin/permissions"),
      ),
    staleTime: 5 * 60_000, // permissions are seeded, change rarely
  });
}

export function useSetRolePermissions(roleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (permissionKeys: string[]) =>
      requireErpData(
        await erpApi.PUT<RoleDetail>("/admin/roles/{id}/permissions", {
          params: { path: { id: roleId } },
          body: { permissionKeys } satisfies SetRolePermissionsRequest,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "role", roleId] });
      // Optional: refetch the current user's permissions too — anyone
      // holding this role gets a fresh cache on their next request.
    },
  });
}
```

### Cache invalidation behaviour

Granting/revoking permissions on a role calls `RbacService.invalidateOrgPermissions(orgId)` — every user in the organization gets a fresh permission load on their next API call. The 300s permission cache TTL is bypassed for affected users. No frontend coordination needed beyond invalidating the local `["iam", "role", id]` query.

---

## 10. Query Key Conventions

To keep cache invalidation predictable, use these keys in your hooks:

| Resource           | Key                                |
| ------------------ | ---------------------------------- |
| User list          | `["iam", "users", filters]`        |
| Single user        | `["iam", "user", id]`              |
| Role list          | `["iam", "roles"]`                 |
| Single role        | `["iam", "role", id]`              |
| Permissions catalogue | `["iam", "permissions"]`        |

Invalidate by prefix:

```ts
// After any user mutation
qc.invalidateQueries({ queryKey: ["iam", "users"] }); // covers all filter combos
qc.invalidateQueries({ queryKey: ["iam", "user", id] });
```

---

## 11. End-to-End Test Recipe

Use the OpenAPI UI at `http://localhost:4000/docs` to walk the full lifecycle:

1. `POST /auth/login` as the seeded `inventory.admin@erp.local` → grab `accessToken`.
2. `POST /admin/roles` → create role `Cashier` with `permissionKeys: ["pos.sale.create", "pos.invoice.read"]`.
3. `POST /admin/users` with `{ email: "cashier1@erp.local", firstName: "Lan", lastName: "Nguyen", temporaryPassword: "Lan@2026!", roleIds: ["<role-id>"], branchIds: ["<branch-id>"] }`.
4. `POST /auth/login` with the new user's credentials → verify the JWT payload (decode it) contains `roles` and `branchIds` populated.
5. With the new user's token, call `GET /admin/users` → expect **403** (`Missing required permission: iam.user.read`).
6. As the admin, `PUT /admin/roles/<role-id>/permissions` with `["pos.sale.create", "pos.invoice.read", "iam.user.read"]`.
7. Without re-issuing tokens, call `GET /admin/users` with the cashier's token again → expect **200** (cache invalidation kicked in).
8. As the admin, `DELETE /admin/users/<cashier-id>` → soft delete.
9. Attempt to log in as the cashier → expect **401** (account inactive).

---

## 12. Things the API Does **Not** Do (Yet)

Be aware of these gaps so the UI can degrade gracefully or schedule follow-up work:

- **Self-service password change.** Users currently cannot change their own password; the admin sets every password. Surface a "Contact admin to reset" affordance if you build a profile page.
- **Email invites.** No mailer is wired up. The admin reads the temporary password aloud / shares it out-of-band.
- **Force-change-on-first-login flag.** The backend does not yet mark a password as "must be changed". Frontend can implement a soft prompt by tracking `lastLoginAt === null` (first login indicator).
- **Bulk operations.** No bulk create/deactivate endpoints. Drive bulk UX from the frontend with `Promise.all` over single calls; idempotency keys are auto-generated per call.
- **Audit log of who-did-what.** Mutations log to the API console but there's no admin-visible audit list endpoint yet.

If any of these become blockers, file a follow-up ticket and reference this section.
