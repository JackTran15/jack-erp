# TKT-ABT-03 Controller `POST /auth/switch-branch` + `@Actor()` ưu tiên JWT branch

## Epic

[EPIC-16062026 Active branch trong token](../epics/EPIC-16062026-active-branch-token.md)

## Layer

🟦 Backend only (controller + decorator).

## Summary

Lộ endpoint `POST /auth/switch-branch` (auth bằng access token hiện tại) gọi `AuthService.switchBranch`, và sửa `@Actor()` để **ưu tiên đọc active branch từ JWT**, giữ `X-Branch-Id` làm fallback.

## Deliverables

- `apps/api/src/modules/auth/dto/switch-branch.dto.ts` — `SwitchBranchDto { @IsUUID() @ApiProperty() branchId: string }` (khớp `SwitchBranchRequest`).
- `apps/api/src/modules/auth/auth.controller.ts`:
  - `@Post('switch-branch')` `@HttpCode(HttpStatus.OK)` — **KHÔNG** `@Public()` (cần `AuthGuard` global).
  - Lấy `JwtPayload` hiện tại từ `request.user` (qua `@Req()` hoặc decorator user sẵn có); gọi `this.authService.switchBranch(payload, dto.branchId)`; trả `SwitchBranchResponse`.
  - `@ApiOperation`/`@ApiResponse` mô tả endpoint (tiếng Anh).
- `apps/api/src/common/decorators/actor-context.decorator.ts`:
  - Đổi thứ tự resolve `branchId`: **`fromJwt` (jwt.branchId) → `fromHeader` (validated) → `fromJwtList` (branchIds[0])**. Hiện tại đang `fromHeader ?? fromJwt ?? fromJwtList` → đổi thành `fromJwt ?? fromHeader ?? fromJwtList`. Giữ nguyên phần validate header nằm trong `branchIds[]`.

## Acceptance Criteria

- [ ] `POST /auth/switch-branch` yêu cầu Bearer token hợp lệ (thiếu/expired → 401 từ `AuthGuard`); body sai schema → 400 (whitelist).
- [ ] Trả token mới mang active branch khi `branchId` hợp lệ; `branchId` không thuộc user → 403.
- [ ] `@Actor().branchId` ưu tiên `jwt.branchId`; nếu token chưa mang branch → dùng `X-Branch-Id` (đã validate) → `branchIds[0]`.
- [ ] Endpoint kế thừa `IdempotencyInterceptor` (mutation) — không tự cài lại (xem [[feedback_idempotent_implementation]]).
- [ ] Request cũ (token không có `branchId`) + có `X-Branch-Id` vẫn scope đúng (fallback giữ nguyên).

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `lint` xanh; Swagger `/docs` hiện `POST /auth/switch-branch` + `SwitchBranchDto`.
- [ ] Actor spec + e2e (TKT-ABT-07) xanh.
- [ ] Source/Swagger tiếng Anh.

## Tech Approach

```ts
// auth.controller.ts
@Post('switch-branch')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Switch active branch and mint new tokens' })
async switchBranch(
  @Req() req: { user: JwtPayload },
  @Body() dto: SwitchBranchDto,
): Promise<SwitchBranchResponse> {
  return this.authService.switchBranch(req.user, dto.branchId);
}

// actor-context.decorator.ts  (only the resolution order changes)
branchId: fromJwt ?? fromHeader ?? fromJwtList,
```

- Lấy payload: dùng `@Req()` (đơn giản) hoặc decorator `@CurrentUser()` nếu repo đã có. `@Actor()` **không** dùng được ở đây vì `ActorContext` chỉ có 1 `branchId`, còn `switchBranch` cần `branchIds[]` để validate → cần raw `JwtPayload`.

## Dependencies

- Requires: TKT-ABT-02 (`switchBranch()`), TKT-ABT-01 (types).
- Blocks: TKT-ABT-04, TKT-ABT-07.
