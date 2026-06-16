# TKT-ABT-01 shared-interfaces: active branch trong JwtPayload + SwitchBranch types

## Epic

[EPIC-16062026 Active branch trong token](../epics/EPIC-16062026-active-branch-token.md)

## Layer

🟪 Shared interfaces (`@erp/shared-interfaces`).

## Summary

Mở rộng kiểu auth dùng chung để (a) `JwtPayload` mang **chi nhánh đang chọn** (`branchId?`) và (b) định nghĩa request/response cho endpoint `POST /auth/switch-branch`. Các app FE + API import từ đây.

## Deliverables

- `packages/shared-interfaces/src/auth/index.ts`:
  - Thêm field `branchId?: string` vào `JwtPayload` (active branch đang chọn). **Giữ nguyên** `branchIds: string[]` (danh sách chi nhánh được phép). Ghi comment rõ: `branchId` = chi nhánh đang active, `branchIds` = tập hợp được phép.
  - `SwitchBranchRequest { branchId: string }`.
  - `SwitchBranchResponse` — mirror `LoginResponse` (`accessToken`, `refreshToken`, `expiresIn`, `session`) để FE cập nhật được cả token lẫn thông tin phiên (permissions/branchIds/active branch). Nếu `LoginResponse` đã đủ field, có thể `export type SwitchBranchResponse = LoginResponse;` kèm comment.
- Build lại package (`postinstall`/`pnpm build:shared`) để API + FE thấy type mới.

## Acceptance Criteria

- [ ] `JwtPayload.branchId?: string` xuất hiện trong type công khai; `branchIds` không đổi.
- [ ] `SwitchBranchRequest` chỉ có `branchId: string` (khớp DTO BE — global `whitelist: true`).
- [ ] `SwitchBranchResponse` mang đủ `accessToken`/`refreshToken`/`expiresIn`/`session`.
- [ ] Không thay đổi shape `LoginResponse`/`RefreshResponse` hiện có (chỉ thêm mới / thêm field optional).

## Definition of Done

- [ ] `pnpm --filter @erp/shared-interfaces build` xanh; `tsc` các consumer không vỡ.
- [ ] Comment/identifier tiếng Anh (xem [[feedback_no_vietnamese_in_backend_source]]).

## Tech Approach

```ts
export interface JwtPayload {
  userId: string;
  organizationId: string;
  roles: string[];
  branchIds: string[];      // branches the user may access
  branchId?: string;        // currently active branch (NEW)
  jti: string;
  iat: number;
  exp: number;
}

export interface SwitchBranchRequest {
  branchId: string;
}

// Same shape as login so the FE can refresh tokens + session display.
export type SwitchBranchResponse = LoginResponse;
```

## Dependencies

- Requires: —
- Blocks: TKT-ABT-02, TKT-ABT-03.
