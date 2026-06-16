# TKT-ABT-07 Tests + E2E + DoD gate

## Epic

[EPIC-16062026 Active branch trong token](../epics/EPIC-16062026-active-branch-token.md)

## Layer

🟨 Tests (unit + e2e) + DoD.

## Summary

Khóa hành vi epic bằng unit spec (AuthService + `@Actor()`) và 1 e2e xuyên suốt: login → switch-branch → gọi endpoint scoped **không** kèm `X-Branch-Id` → scope đúng chi nhánh mới. Đảm bảo không regression auth cũ.

## Deliverables

- `apps/api/src/modules/auth/auth.service.spec.ts` (mở rộng):
  - `login()` bake `branchId = branchIds[0]` vào session + access token; user 0 chi nhánh → `branchId` undefined.
  - `switchBranch()` hợp lệ: revoke jti cũ, tạo session mới có `branchId`, trả token mới mang branch.
  - `switchBranch()` `branchId ∉ branchIds` → `ForbiddenException`, session hiện tại **không** revoke.
  - `refresh()` giữ active branch; active branch cũ không còn được phép → fallback `branchIds[0]`.
- `apps/api/src/common/decorators/actor-context.decorator.spec.ts` (mới hoặc mở rộng):
  - `jwt.branchId` có → actor dùng nó (bỏ qua header).
  - `jwt.branchId` thiếu + header hợp lệ ∈ branchIds → dùng header.
  - thiếu cả hai → `branchIds[0]`.
- `apps/api/test/e2e/...` (1 spec):
  - Đăng nhập user nhiều chi nhánh → `POST /auth/switch-branch { branchId: B }` → gọi 1 endpoint scoped (vd `/auth/session` hoặc 1 list scoped) **không** gửi `X-Branch-Id` → khẳng định scope/active branch = B.
  - Token cũ (trước switch) → 401 (session revoked).

## Acceptance Criteria

- [ ] Tất cả spec trên xanh.
- [ ] E2E chứng minh actor đọc branch từ JWT (không cần header) sau switch.
- [ ] E2E chứng minh token cũ bị vô hiệu sau switch.
- [ ] Regression: spec login/refresh/logout cũ vẫn xanh; request gửi `X-Branch-Id` (token không branch) vẫn scope đúng.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] `pnpm --filter @erp/api test:e2e` xanh (chạy trên `erp_test`, xem [[project_e2e_test_db_setup]]).
- [ ] FE verify (TKT-ABT-05/06) đã thực hiện: đổi chi nhánh → dữ liệu đổi theo.
- [ ] Không Vietnamese trong source BE.

## Tech Approach

- Mock `SessionStore` trong unit spec (assert `revokeSession`/`createSession` được gọi đúng args).
- E2E dùng setup `erp_test` sẵn có; seed user với ≥2 chi nhánh.

## Dependencies

- Requires: TKT-ABT-02, TKT-ABT-03, TKT-ABT-05, TKT-ABT-06.
- Blocks: —
