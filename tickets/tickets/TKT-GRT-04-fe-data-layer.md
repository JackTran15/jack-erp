# TKT-GRT-04 FE data layer: useImportableTransferOrders + mapper

## Epic

[EPIC-08062026 Lập phiếu nhập kho từ chứng từ điều chuyển](../epics/EPIC-08062026-goods-receipt-from-transfer.md)

## Layer

🟨 Frontend data layer (TanStack Query hooks over `erpApi`/`apiClient`).

## Summary

Lớp fetch cho picker chứng từ điều chuyển (import) + tải chi tiết lệnh để prefill. Mirror lớp data của `SelectTransferOrderDialog` (chân xuất).

## Deliverables

- Hook/loader gọi `GET /inventory/transfer-orders/importable?from=&to=` → `ImportableTransferOrderListItem[]` (theo `X-Branch-Id` đích). Dùng `apiClient` (axios) như `SelectTransferOrderDialog` hiện tại, hoặc TanStack Query nếu cần cache.
- Loader `GET /inventory/transfer-orders/:id` → `TransferOrderDetail` (đã có type ở chân xuất; tái dùng `lines[ item, requestedQty ]`).
- Type FE cục bộ cho dòng picker (Ngày / Số chứng từ XK / Tổng thành tiền) nếu không import trực tiếp từ `@erp/shared-interfaces`.

## Acceptance Criteria

- [ ] Hook trả đúng danh sách importable theo khoảng ngày + chi nhánh đích hiện tại.
- [ ] Lỗi API surface qua `getUserFacingApiErrorMessage` (toast), không nuốt lỗi.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` (tsc) xanh.
- [ ] Không trùng type đã có trong `@erp/shared-interfaces`.

## Dependencies

- Depends on: TKT-GRT-03. Blocks: TKT-GRT-05.
