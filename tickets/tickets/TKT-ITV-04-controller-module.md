# TKT-ITV-04 Controller: replace approve/execute with export/import + by-code; module wiring + events

## Epic

[EPIC-07062026 Phiếu Điều Chuyển Kho](../epics/EPIC-07062026-inventory-transfer-voucher.md)

## Layer

🟦 Backend only (HTTP surface).

## Summary

Đổi `TransferOrderController`: **bỏ** `POST /:id/approve` + `POST /:id/execute`, **thêm** `POST /:id/export`, `POST /:id/import`, `GET /by-code/:code`, `PATCH /:id`. Wire `TransferOrderModule` import `GoodsIssueModule` + `GoodsReceiptModule`. Mutation thừa hưởng `IdempotencyInterceptor` toàn cục.

## Deliverables

- `apps/api/src/modules/inventory/transfer-order/transfer-order.controller.ts` — `@Controller('inventory/transfer-orders')`, `@UseGuards(PermissionGuard, BranchScopeGuard)` (+ `AuditInterceptor` như cũ), `@Actor()`:
  - `POST /` → `create` · `inventory.transfer.create` · `@RequireBranchScope()`. (giữ)
  - `GET /` → `list` · `inventory.transfer.read`. (giữ)
  - `GET /by-code/:code` → `getByCode` · `inventory.transfer.read` (org-scoped, **không** `@RequireBranchScope`). (mới)
  - `GET /:id` → `getById` · `inventory.transfer.read`. (giữ)
  - `PATCH /:id` → `update` · `inventory.transfer.create`. (mới)
  - `POST /:id/export` → `confirmExport` · `inventory.transfer.export` · `@RequireBranchScope()`. (mới, thay `approve`)
  - `POST /:id/import` → `confirmImport` · `inventory.transfer.import` · `@RequireBranchScope()`. (mới, thay `execute`)
  - `POST /:id/cancel` hoặc `DELETE /:id` → `cancel` · `inventory.transfer.cancel`. (giữ, cập nhật logic)
  - **Bỏ** `POST /:id/approve`, `POST /:id/execute`, DTO `MarkExecutedDto`.
- `apps/api/src/modules/inventory/transfer-order/transfer-order.module.ts` — thêm imports `GoodsIssueModule`, `GoodsReceiptModule`, `EventsModule`, `TypeOrmModule.forFeature([... , LocationEntity, ItemEntity])`; vẫn `exports: [TransferOrderService]`. Bỏ phụ thuộc StockTransfer nếu có.
- Lifecycle events qua `EventPublisher` (deterministic `eventId`): `inventory.transfer-order.exported` (voucherId, documentNumber, sourceBranchId, destinationBranchId, goodsIssueId) và `inventory.transfer-order.completed` (… goodsReceiptId). **Không** consumer mới.

## Acceptance Criteria

- [ ] Không còn route `approve`/`execute`; có đủ `export`/`import`/`by-code`/`PATCH`.
- [ ] export/import có `@RequireBranchScope()` (cần `X-Branch-Id`); `by-code` org-scoped load được dù active branch khác branch nguồn/đích.
- [ ] Double-export/import: cùng `X-Idempotency-Key` → replay; khác key → 409 do state-guard.
- [ ] Event `exported`/`completed` phát đúng 1 lần, eventId xác định.
- [ ] App bootstrap không lỗi DI (GoodsIssue/GoodsReceipt service inject được).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass; e2e smoke (auth + permission denied + route cũ trả 404).
- [ ] `/docs` nhóm `inventory/transfer-orders` đúng route mới (regen ở TKT-ITV-06).
- [ ] Không Vietnamese trong source backend.

## Tech Approach

`confirmExport`/`confirmImport` body rỗng (hoặc `{ notes? }`); `actor.branchId` từ `@Actor()` (đã khớp `X-Branch-Id` qua `BranchScopeGuard`). Giữ pattern guard/decorator của controller hiện tại; chỉ swap method body + route.

## Dependencies

- Depends on: TKT-ITV-03, TKT-ITV-05.
- Blocks: TKT-ITV-06, TKT-ITV-09.
