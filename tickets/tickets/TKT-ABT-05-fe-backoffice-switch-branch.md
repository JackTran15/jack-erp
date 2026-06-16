# TKT-ABT-05 FE backoffice-web: BranchSelector gọi switch-branch → lưu token → reload

## Epic

[EPIC-16062026 Active branch trong token](../epics/EPIC-16062026-active-branch-token.md)

## Layer

🟩 Frontend only (backoffice-web).

## Summary

Khi user đổi chi nhánh ở header `BranchSelector`, thay vì chỉ ghi localStorage + reload, **gọi `POST /auth/switch-branch`**, lưu access (in-memory) + refresh (localStorage) + active branch mới, rồi reload. Sau reload, bootstrap refresh dùng refresh token mới → access token mang active branch (không cần `X-Branch-Id`).

## Deliverables

- `apps/backoffice-web/src/lib/auth-storage.ts` — thêm `persistSwitchBranchResponse(res: SwitchBranchResponse, branchId: string)`:
  - `setAccessToken(res.accessToken)` (in-memory), `localStorage.setItem(REFRESH, res.refreshToken)`, `setActiveBranch(branchId)`, cập nhật permissions/session info nếu response trả (`persistSessionInfo`).
- `apps/backoffice-web/src/components/layout/BranchSelector.tsx` — `handleSelect(id)`:
  - Gọi `requireErpData(await erpApi.POST<SwitchBranchResponse>('/auth/switch-branch', { body: { branchId: id } }))`.
  - Thành công → `persistSwitchBranchResponse(res, id)` → `window.location.reload()`.
  - Lỗi → toast tiếng Việt (vd "Không thể đổi chi nhánh."), **không** reload.
  - Đặt trạng thái loading/disable dropdown trong lúc gọi.

## Acceptance Criteria

- [ ] Đổi chi nhánh gọi `POST /auth/switch-branch { branchId }` với access token hiện tại.
- [ ] Sau thành công: refresh token mới ở localStorage, active branch mới ở `active_branch_id`, reload.
- [ ] Sau reload, request **không** kèm `X-Branch-Id` (hoặc kèm) đều scope đúng chi nhánh mới (token mang branch).
- [ ] Token cũ không còn dùng được (session jti cũ revoked) — không có request "lơ lửng" dùng token cũ gây 401 nhìn thấy được.
- [ ] Đổi sang chi nhánh không hợp lệ (BE 403) → toast lỗi, giữ nguyên chi nhánh cũ.

## Definition of Done

- [ ] `tsc` backoffice xanh; UI strings tiếng Việt.
- [ ] Import từ `@erp/ui`; không default export; icons `lucide-react`.
- [ ] Verify trực quan: đổi chi nhánh → danh sách dữ liệu đổi theo chi nhánh mới (screenshot trước/sau).

## Tech Approach

- `BranchSelector` đang `setActiveBranch(id); window.location.reload()` → chèn bước gọi switch-branch trước reload.
- Token in-memory mất sau reload là **bình thường**: `useAuth` bootstrap gọi `/auth/refresh` bằng refresh token mới → access token mới vẫn mang active branch (session giữ active branch). Không cần đổi bootstrap.
- `erpApi` tự gắn Authorization từ `getAccessToken()` → switch-branch chạy bằng token hiện tại; không cần truyền tay.

## Dependencies

- Requires: TKT-ABT-04 (client regen), TKT-ABT-03 (endpoint).
- Blocks: TKT-ABT-07 (verify).
