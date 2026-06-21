# TKT-GIV-02 FE: trang Xuất kho backoffice (mirror Nhập kho)

## Epic

[EPIC-18062026 Xuất kho v2](../epics/EPIC-18062026-goods-issue-v2.md)

## Layer

🟩 Frontend (backoffice-web) — mirror TKT-GRV-02.

## Summary

Trang/dialog Xuất kho mới: picker **Đối tượng** (NCC & KH), chọn hàng **theo nhóm/mẫu mã (multi-select)**, autofill Kho/Vị trí xuất theo **chi nhánh hiện tại**, bảng dòng hàng **min-width**. Gọi command v2.

## Deliverables

- `apps/backoffice-web/src/pages/goods-issue-v2/GoodsIssueV2Page.tsx` (+ dialog) — không sửa `GoodsIssuePage` cũ:
  - Header: nút **Đối tượng** mở `CounterpartySearchDialog` (`allowKinds=[supplier,customer]`).
  - Kho/Vị trí default theo chi nhánh; nút **Chọn hàng** mở `ProductGroupSearchDialog` multi-select theo mẫu mã.
  - Thêm item → `useResolveItemLocations` autofill vị trí xuất (bin giữ hàng); variant cùng mẫu khoá cùng vị trí.
  - Bảng dòng hàng: `min-w-[…]` mỗi cột.
  - Lưu/Post → endpoint v2; `erpApi` gắn `X-Idempotency-Key`.
- `App.tsx` + `navConfig.ts` — `<Route>` + `NavChild`.
- Hooks: `useCreateGoodsIssueV2`, `usePostGoodsIssueV2`; invalidate `["goods-issues"]`.

## Acceptance Criteria

- [ ] Chọn đối tượng NCC/KH qua dialog tìm nâng cao.
- [ ] Chọn mẫu mã (multi-select) → thêm hết variant, cùng vị trí xuất.
- [ ] Kho/Vị trí default theo chi nhánh; dòng có tồn → autofill bin.
- [ ] Bảng không bị chật (min-width).
- [ ] Tạo/Post qua endpoint v2; 422 hiển thị tiếng Việt.
- [ ] Có `<Route>` + `NavChild`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Visual trước/sau.
- [ ] Tái sử dụng component EPIC-A + nhãn `ITEM_FIELD_LABELS`; `@erp/ui`; server-data ở TanStack Query.

## Tech Approach

- Mirror TKT-GRV-02; tách phần dùng chung (form dòng hàng, khoá vị trí theo product) thành hook/sub-component reuse giữa Nhập/Xuất nếu gọn.

## Dependencies

- Requires: TKT-GIV-01, TKT-FND-03, TKT-FND-04, TKT-FND-05, TKT-FND-06; tham chiếu TKT-GRV-02.
- Blocks: TKT-GIV-03.
