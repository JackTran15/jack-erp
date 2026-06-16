# TKT-ABT-06 FE pos-web: BranchSelectPage gọi switch-branch → lưu token → navigate

## Epic

[EPIC-16062026 Active branch trong token](../epics/EPIC-16062026-active-branch-token.md)

## Layer

🟩 Frontend only (pos-web).

## Summary

Trên `BranchSelectPage`, khi user chọn chi nhánh, **gọi `POST /auth/switch-branch`**, lưu access + refresh mới (localStorage), set branch trong `usePosBranchStore`, rồi điều hướng về `/`. POS không reload nên token mới được dùng ngay ở request kế.

## Deliverables

- `apps/pos-web/src/services/auth.service.ts` — thêm `switchBranch(branchId: string): Promise<void>`:
  - `requireErpData(await erpApi.POST<SwitchBranchResponse>('/auth/switch-branch', { body: { branchId } }))`.
  - `localStorage.setItem(ACCESS_TOKEN_KEY, res.accessToken)`, `localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken)`.
- `apps/pos-web/src/pages/BranchSelectPage.tsx` — handler chọn chi nhánh:
  - `await authService.switchBranch(opt.id)` → `setBranch(opt.id, opt.name)` → `navigate('/', { replace: true })`.
  - Loading/disable trong lúc gọi; lỗi → thông báo tiếng Việt, ở lại trang chọn.

## Acceptance Criteria

- [ ] Chọn chi nhánh gọi `POST /auth/switch-branch { branchId }` với access token hiện tại (sau login).
- [ ] Access + refresh token mới được lưu localStorage; `usePosBranchStore.branchId` = chi nhánh chọn.
- [ ] Request POS kế tiếp scope đúng chi nhánh (token mang branch; `X-Branch-Id` từ store vẫn khớp — fallback).
- [ ] Chọn chi nhánh không hợp lệ (BE 403) → thông báo lỗi, không điều hướng.

## Definition of Done

- [ ] `tsc` pos xanh; UI strings tiếng Việt.
- [ ] Import từ `@erp/ui`; không default export.
- [ ] Verify: login → chọn chi nhánh → vào trang bán hàng, dữ liệu đúng chi nhánh.

## Tech Approach

- `BranchSelectPage` hiện chỉ `setBranch(opt.id, opt.name); navigate('/')` → chèn `await authService.switchBranch(opt.id)` trước.
- POS giữ access token ở localStorage (khác backoffice in-memory) → không reload, token mới dùng ngay; interceptor `api-axios` đọc lại từ localStorage.
- `usePosBranchStore` vẫn cung cấp `X-Branch-Id` (fallback) — không bỏ.

## Dependencies

- Requires: TKT-ABT-04 (client regen), TKT-ABT-03 (endpoint).
- Blocks: TKT-ABT-07 (verify).
