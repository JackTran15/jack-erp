# TKT-STX-02 FE: trang Chuyển kho backoffice (scan, autofill, dialog nhóm)

## Epic

[EPIC-18062026 Chuyển kho v2](../epics/EPIC-18062026-stock-transfer-v2.md)

## Layer

🟩 Frontend (backoffice-web).

## Summary

Trang/dialog Chuyển kho mới trong backoffice: chọn kho nguồn/đích, **quét mã vạch** thêm dòng, **autofill vị trí xuất** theo hàng hoá (fallback kho mặc định), nút "Tìm hàng" mở dialog nhóm hàng (multi-select). Gọi command v2.

## Deliverables

- `apps/backoffice-web/src/pages/stock-transfer-v2/StockTransferV2Page.tsx` (+ dialog tạo phiếu) — hoặc nhánh mới trong trang Chuyển kho hiện có (không sửa luồng cũ):
  - Ô chọn **Kho nguồn** / **Kho đích** (label rõ).
  - Input **quét mã vạch**: nhập/quét → tra mã → thêm dòng (qty 1, quét lại +1).
  - Nút **Tìm hàng** mở `ProductGroupSearchDialog` (TKT-FND-05), `branchId` = chi nhánh hiện tại, multi-select theo mẫu mã → thêm các variant.
  - Khi thêm item: gọi `useResolveItemLocations` (TKT-FND-03) với `storageId` = kho nguồn → autofill `sourceLocationId` từng dòng; trống → theo kho mặc định.
  - Hiển thị & gửi: mọi variant cùng mẫu mã cùng `sourceLocationId` (khoá theo nhóm).
  - Lưu (DRAFT) → `POST /v2/inventory/stock/transfers`; Post → `POST /v2/.../:id/post`. Dùng `erpApi`/`requireErpData`, tự gắn `X-Idempotency-Key`.
- `apps/backoffice-web/src/App.tsx` — `<Route>` trang Chuyển kho v2.
- `apps/backoffice-web/src/components/layout/navConfig.ts` — `NavChild` cho trang.
- Hook data: `useCreateStockTransferV2`, `usePostStockTransferV2` (TanStack Query), invalidate theo prefix `["stock-transfers"]`.

## Acceptance Criteria

- [ ] Quét mã vạch tồn tại → thêm 1 dòng, vị trí xuất autofill; quét lại → +1.
- [ ] Dialog nhóm hàng chọn mẫu mã (multi-select) → thêm hết variant của mẫu, cùng vị trí xuất.
- [ ] Item có vị trí ở kho nguồn → autofill đúng; không có → kho mặc định; vẫn không → "Mặc định".
- [ ] Tạo + Post chạy qua endpoint v2; lỗi product-uniform (422) hiển thị thông báo tiếng Việt.
- [ ] Có `<Route>` + `NavChild`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Rà soát visual: chụp trước/sau, mô tả diff; min-width bảng đủ thoáng.
- [ ] Dùng `@erp/ui` primitives + `erpApi`; không nhét server-data vào Zustand.
- [ ] Nhãn tiếng Việt; tái sử dụng component dùng chung EPIC-A (không copy).

## Tech Approach

- Tái dùng dialog/hook EPIC-A; trang chỉ orchestrate. Khoá vị trí theo nhóm bằng cách group dòng theo `productId` khi set/đổi vị trí.

## Dependencies

- Requires: TKT-STX-01, TKT-FND-03, TKT-FND-05.
- Blocks: TKT-STX-03.
