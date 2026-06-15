# TKT-STL-02 BE: Xóa = đảo bút toán + void (reverse & cancel)

## Epic

[EPIC-09062026 Danh sách Chuyển kho theo mẫu mShopKeeper](../epics/EPIC-09062026-stock-transfer-list-v2.md)

## Layer

🟦 Backend only (service + controller).

## Summary

Nút **Xóa** trên danh sách phải xoá được phiếu chuyển **đã POSTED**. Vì stock ledger bất biến, "Xóa" = **đảo bút toán** (trả tồn về trạng thái trước) rồi **set `status = CANCELLED`** (soft-void, không hard-delete). Mở rộng `StockTransferService.cancel` để xử lý POSTED; giữ hành vi DRAFT cũ. Tái dùng endpoint `POST /inventory/stock/transfers/:id/cancel` (nút "Hoãn" cũ → đổi thành "Xóa").

## Deliverables

- `apps/api/src/modules/inventory/transfer/stock-transfer.service.ts` — sửa `cancel(id, actor)`:
  - DRAFT → set `CANCELLED` như cũ.
  - POSTED → trong **1 transaction**: build bút toán đảo cho từng line (`TRANSFER_IN` +qty về `sourceLocation`, `TRANSFER_OUT` −qty khỏi `destinationLocation`, `unitCost = line.unitPrice ?? snapshot`, `referenceType='TRANSFER_REVERSAL'`, `referenceId = transfer.id`), `recordBatchMovements(reversed, manager)`, set `status = CANCELLED` (+ `cancelledBy`/`cancelledAt` nếu có cột; nếu không, chỉ status). Publish events sau commit.
  - Đã `CANCELLED` → `BadRequestException` (idempotent, không đảo 2 lần). Cập nhật `VALID_TRANSITIONS[POSTED] = [CANCELLED]`.
- `apps/api/src/modules/inventory/transfer/stock-transfer.controller.ts` — giữ `@Post(':id/cancel')` + `@RequirePermission('inventory.transfer.cancel')`; (tùy chọn) thêm alias `@Post(':id/reverse')` trỏ cùng service nếu muốn tên rõ nghĩa.

## Acceptance Criteria

- [ ] Xóa phiếu POSTED: tồn `sourceLocation` tăng lại đúng qty, `destinationLocation` giảm lại đúng qty (đảo 2 chân); phiếu → `CANCELLED`.
- [ ] Phiếu `CANCELLED` không còn xuất hiện trong `POST /v2/.../search` (đã filter `status != CANCELLED`).
- [ ] Gọi Xóa lần 2 trên cùng phiếu → 400, không đảo thêm; idempotent qua `IdempotencyInterceptor` + reversal entries có `eventId` deterministic.
- [ ] Toàn bộ đảo bút toán + đổi status nằm trong 1 transaction (all-or-nothing).
- [ ] Scope `organizationId`; chỉ phiếu cùng org/branch mới xoá được.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `lint` pass; reverse spec (TKT-STL-05) xanh.
- [ ] Không Vietnamese trong source BE.
- [ ] Không phá `createIntraWarehouseTransferAndPost` / temp-warehouse consumer (cancel cũ DRAFT vẫn chạy).

## Tech Approach

- Tái dùng pattern build movements + transaction từ `post()` (đảo dấu qty + swap location source/dest). `publishMovementEvents` sau commit.
- "Soft-delete" = `status = CANCELLED` (không thêm cột `deleted_at`, không migration) — danh sách v2 lọc bỏ CANCELLED.

## Dependencies

- Requires: EPIC-09062026 (post path + ledger).
- Blocks: TKT-STL-04 (nút Xóa), TKT-STL-05.
