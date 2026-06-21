# TKT-GRV-02 FE: trang Nhập kho backoffice (đối tượng, nhóm hàng, autofill, min-width)

## Epic

[EPIC-18062026 Nhập kho v2](../epics/EPIC-18062026-goods-receipt-v2.md)

## Layer

🟩 Frontend (backoffice-web).

## Summary

Trang/dialog Nhập kho mới: picker **Đối tượng** (NCC & KH, tìm nâng cao), chọn hàng **theo nhóm/mẫu mã (multi-select)**, autofill Kho/Vị trí theo **chi nhánh hiện tại**, bảng dòng hàng có **min-width**. Gọi command v2.

## Deliverables

- `apps/backoffice-web/src/pages/goods-receipt-v2/GoodsReceiptV2Page.tsx` (+ dialog tạo) — không sửa `PurchaseOrdersPage` cũ:
  - Header: nút **Đối tượng** mở `CounterpartySearchDialog` (TKT-FND-04, `allowKinds=[supplier,customer]`); lưu `counterpartyKind`+`counterpartyId`.
  - Kho/Vị trí default theo chi nhánh đang chọn; nút **Chọn hàng** mở `ProductGroupSearchDialog` (TKT-FND-05) multi-select theo mẫu mã.
  - Khi thêm item: `useResolveItemLocations` (không truyền `storageId` → theo kho mặc định chi nhánh, hoặc truyền kho đã chọn) autofill vị trí; variant cùng mẫu khoá cùng vị trí.
  - Bảng dòng hàng: thêm `min-w-[…]` mỗi cột (Mã SKU, Tên hàng hoá, Kho, Vị trí, ĐVT, SL, Đơn giá, Thành tiền, Ghi chú) cho thoáng.
  - Lưu/Post → endpoint v2; `erpApi` tự gắn `X-Idempotency-Key`.
- `App.tsx` + `navConfig.ts` — `<Route>` + `NavChild`.
- Hooks: `useCreateGoodsReceiptV2`, `usePostGoodsReceiptV2`; invalidate `["goods-receipts"]`.

## Acceptance Criteria

- [ ] Chọn đối tượng NCC hoặc KH qua dialog tìm nâng cao (phân trang).
- [ ] Chọn mẫu mã (multi-select) → thêm hết variant, cùng vị trí nhập.
- [ ] Đang ở chi nhánh Cà Mau → Kho/Vị trí default theo Cà Mau; dòng có lịch sử → autofill vị trí.
- [ ] Bảng dòng hàng không bị chật (min-width mỗi cột).
- [ ] Tạo/Post qua endpoint v2; 422 product-uniform hiển thị tiếng Việt.
- [ ] Có `<Route>` + `NavChild`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Visual trước/sau (đặc biệt min-width + autofill).
- [ ] Tái sử dụng component EPIC-A; `@erp/ui` primitives; server-data ở TanStack Query.
- [ ] Nhãn tiếng Việt theo `ITEM_FIELD_LABELS` (TKT-FND-06).

## Tech Approach

- Trang orchestrate; mọi search/resolve dùng hook/dialog EPIC-A. Khoá vị trí theo `productId`.

## Dependencies

- Requires: TKT-GRV-01, TKT-FND-03, TKT-FND-04, TKT-FND-05, TKT-FND-06.
- Blocks: TKT-GRV-03.
