# TKT-ITV-07 FE data layer: extend transfer-order hooks + balance warning

## Epic

[EPIC-07062026 Phiếu Điều Chuyển Kho](../epics/EPIC-07062026-inventory-transfer-voucher.md)

## Layer

🟨 Frontend (backoffice-web) — data layer.

## Summary

Mở rộng lớp gọi API của **trang Lệnh điều chuyển hiện có** trên `backoffice-web`: bỏ hook approve/execute, thêm export/import/by-code/update; type lấy từ `@erp/shared-interfaces` (`TransferOrder`, `TransferOrderStatus` 4 giá trị). Thêm hook đọc tồn để cảnh báo "xuất kho khống" client-side.

## Deliverables

- Service/hook hiện có của transfer-orders (vd `apps/backoffice-web/src/pages/transfer-orders/...api.ts` + hooks react-query) — cập nhật:
  - Bỏ `useApproveTransferOrder` / `useExecuteTransferOrder` (route đã xoá).
  - Thêm: `useTransferOrderByCode(code)` (enabled khi có code), `useUpdateTransferOrder`, `useExportTransferOrder`, `useImportTransferOrder`. Giữ list/detail/create/cancel.
  - Query keys giữ prefix `["transfer-orders", ...]`; thêm `["transfer-order-by-code", code]`.
- `useStockBalancesForLines(items, storageId)` — đọc tồn hiện tại (endpoint balance có sẵn) theo **kho nguồn từng dòng** để UI cảnh báo trước export.

## Acceptance Criteria

- [ ] Mọi request qua `erpApi` (tự gắn `Authorization`/`X-Branch-Id`/`X-Request-Id`/`X-Idempotency-Key`); lỗi → `HttpError`.
- [ ] export/import gọi đúng endpoint với active branch hiện tại; mutation invalidate prefix `["transfer-orders"]` + key detail.
- [ ] Không còn tham chiếu `TransferOrderStatus.APPROVED`/`.EXECUTED` trong data layer.
- [ ] Server data chỉ ở TanStack Query (không Zustand).
- [ ] Cảnh báo tồn âm tính client-side; không chặn submit.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass (typecheck với schema/enum mới).
- [ ] Không redefine type đã có trong `@erp/shared-interfaces`.

## Tech Approach

`useExportTransferOrder`/`useImportTransferOrder` = `useMutation` gọi `POST /:id/export|import`, `onSuccess` invalidate. Balance: tái dùng hook/endpoint stock-balance theo itemIds + locationId (resolve từ kho nguồn từng dòng).

## Dependencies

- Depends on: TKT-ITV-02, TKT-ITV-06.
- Blocks: TKT-ITV-08.
