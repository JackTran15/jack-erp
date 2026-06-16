# TKT-ABT-02 AuthService + SessionStore: active branch trong token + switchBranch()

## Epic

[EPIC-16062026 Active branch trong token](../epics/EPIC-16062026-active-branch-token.md)

## Layer

🟦 Backend only (service + Redis session).

## Summary

Gắn **chi nhánh đang chọn** vào token và session: login bake `branchIds[0]`, refresh giữ nguyên active branch, và thêm method `switchBranch()` rotate session + mint token mới mang chi nhánh được chọn. Không có endpoint ở ticket này (xem TKT-ABT-03).

## Deliverables

- `apps/api/src/modules/redis/session.store.ts`:
  - Thêm `branchId?: string` (active branch) vào `SessionPayload`. Giữ `branchIds: string[]`.
- `apps/api/src/modules/auth/auth.service.ts`:
  - **`login()`**: tính `activeBranchId = branchIds[0] ?? undefined`; đưa vào `SessionPayload.branchId` và vào payload access token (`signAccessToken({ ..., branchId: activeBranchId })`).
  - **`refresh()`**: đọc `session.branchId` (active cũ); nếu vẫn ∈ branchIds mới thì giữ, nếu không → `branchIds[0]`; ghi vào session mới + access token mới. (Vẫn re-resolve roles/branchIds từ DB như hiện tại.)
  - **`switchBranch(current: JwtPayload, branchId: string): Promise<SwitchBranchResponse>`** (method mới):
    1. Re-resolve `roles` + `branchIds` từ DB qua helper sẵn có (`resolveUserRoles`/`resolveUserBranches` hoặc `buildSessionInfo`) theo `current.userId` + `current.organizationId`.
    2. Validate `branchId ∈ branchIds` → nếu không: `throw new ForbiddenException('Branch not assigned to user')`.
    3. `await sessionStore.revokeSession(current.jti)` (vô hiệu token cũ).
    4. Tạo `jti` mới + `createSession(newJti, { userId, organizationId, branchIds, branchId, roles, issuedAt, expiresAt }, REFRESH_TOKEN_TTL)`.
    5. `signAccessToken({ userId, organizationId, roles, branchIds, branchId, jti: newJti })` + `signRefreshToken({ jti: newJti, userId })`.
    6. Trả `{ accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL, session }` (mirror `login()` return; `session` chứa `branchIds`, permissions nếu login đang trả, và active branch).

## Acceptance Criteria

- [ ] `login()` set `branchId = branchIds[0]` trong cả session lẫn access token; user không có chi nhánh → `branchId` undefined (không crash).
- [ ] `switchBranch()` với `branchId ∈ branchIds`: revoke jti cũ, tạo session mới mang active branch, trả token mới; token cũ → `isSessionActive(oldJti)` false.
- [ ] `switchBranch()` với `branchId ∉ branchIds`: `ForbiddenException`, **không** revoke/rotate session hiện tại.
- [ ] `refresh()` giữ nguyên active branch của session (fallback `branchIds[0]` nếu active branch cũ không còn được phép).
- [ ] Mọi nhánh dùng `resolveUser*`/`buildSessionInfo` sẵn có — không trùng lặp logic resolve.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `lint` xanh.
- [ ] Service spec (TKT-ABT-07) xanh.
- [ ] Source/Swagger/logs tiếng Anh (xem [[feedback_no_vietnamese_in_backend_source]]).
- [ ] Không đổi DB schema; không migration.

## Tech Approach

```ts
// session.store.ts
export interface SessionPayload {
  userId: string;
  organizationId: string;
  branchIds: string[];
  branchId?: string;          // active branch (NEW)
  roles: string[];
  issuedAt: number;
  expiresAt: number;
}

// auth.service.ts
async switchBranch(current: JwtPayload, branchId: string): Promise<SwitchBranchResponse> {
  const { roles, branchIds } = await this.buildSessionInfo(current.userId, current.organizationId);
  if (!branchIds.includes(branchId)) {
    throw new ForbiddenException('Branch not assigned to user');
  }
  await this.sessionStore.revokeSession(current.jti);

  const jti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await this.sessionStore.createSession(
    jti,
    { userId: current.userId, organizationId: current.organizationId, branchIds, branchId, roles,
      issuedAt: now, expiresAt: now + REFRESH_TOKEN_TTL },
    REFRESH_TOKEN_TTL,
  );

  const accessToken = this.signAccessToken({
    userId: current.userId, organizationId: current.organizationId, roles, branchIds, branchId, jti,
  });
  const refreshToken = this.signRefreshToken({ jti, userId: current.userId });
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL, session: { /* org, branchIds, branchId, permissions… */ } };
}
```

- `switchBranch` chạy trên **access token hiện tại** (`request.user`), không cần refresh token — khác `refresh()` (chạy trên refresh token). Cả hai cùng pattern revoke-rồi-create session.

## Dependencies

- Requires: TKT-ABT-01 (`JwtPayload.branchId`, `SwitchBranchResponse`).
- Blocks: TKT-ABT-03, TKT-ABT-07.
