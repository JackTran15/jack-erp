# TKT-STX-01 BE: Create/Post StockTransfer v2 (CQRS command) + events

## Epic

[EPIC-18062026 Chuyển kho v2](../epics/EPIC-18062026-stock-transfer-v2.md)

## Layer

🟦 Backend (CQRS command mới, không sửa endpoint cũ).

## Summary

Hai command CQRS mới tạo + post phiếu chuyển kho, ghi stock ledger 2 chiều, enforce vị trí product-uniform, phát event. Endpoint cũ `POST /inventory/stock/transfers` **giữ nguyên**.

## Deliverables

- `apps/api/src/modules/inventory/transfer/dto/create-stock-transfer-v2.dto.ts` — header + lines:
  - header: `sourceStorageId`, `destinationStorageId`, `transferredAt?`, `notes?`, `transporterUserId?`.
  - line: `itemId`, `productId`, `quantity (>0)`, `sourceLocationId?`, `destinationLocationId?`, `unitPrice?`, `notes?`.
- `apps/api/src/modules/inventory/transfer/commands/create-stock-transfer-v2.command.ts` + `.handler.ts` — `@CommandHandler` (tx):
  - `productLocationService.assertProductUniformLocation(lines)` (cùng mẫu mã → cùng `sourceLocationId`).
  - resolve `sourceLocationId`/`destinationLocationId` còn trống qua `ResolveItemLocations` logic (kho nguồn) / unassigned (kho đích).
  - `documentNumberingService` sinh số phiếu; insert header+lines DRAFT.
  - publish `inventory.stock_transfer.v2.created` (eventId = `transfer-created:{id}`).
- `apps/api/src/modules/inventory/transfer/commands/post-stock-transfer-v2.command.ts` + `.handler.ts` — `@CommandHandler` (tx):
  - validate DRAFT; `stockLedgerService.recordBatchMovements` xuất kho nguồn + nhập kho đích (giá vốn snapshot nếu `unitPrice` trống).
  - `upsertUniformItemStorageLocation` cho kho đích (variant cùng mẫu mã → cùng vị trí đích).
  - status=POSTED; publish `inventory.stock_transfer.v2.posted` (eventId = `transfer-posted:{id}`).
- `apps/api/src/modules/inventory/transfer/controllers/stock-transfer-command-v2.controller.ts` — `POST /v2/inventory/stock/transfers`, `POST /v2/inventory/stock/transfers/:id/post`; guards `AuthGuard, PermissionGuard, BranchScopeGuard`; `@RequirePermission('inventory.transfer.write')`; `@RequireBranchScope()`. Kế thừa `IdempotencyInterceptor`.
- `stock-transfer.module.ts` — register 2 handler, import `ProductLocationService` (EPIC-A), `CqrsModule` (đã có).

## Acceptance Criteria

- [ ] Tạo qua command v2 → DRAFT + số phiếu; mọi line cùng mẫu mã share `sourceLocationId`.
- [ ] Post → ghi đúng 2 movement ledger (xuất nguồn, nhập đích); kho đích cập nhật vị trí product-uniform.
- [ ] Hai variant cùng mẫu mã chọn 2 vị trí khác nhau → 422, không tạo phiếu.
- [ ] Replay cùng `X-Idempotency-Key` → trả response cũ; consumer dedupe qua `processed_events` + eventId deterministic.
- [ ] Scope `organizationId` + `branchId`; storage thuộc chi nhánh.
- [ ] Endpoint cũ `POST /inventory/stock/transfers` không đổi.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] Spec: create happy, product-uniform reject, post ledger 2 chiều, idempotency replay.
- [ ] `pnpm openapi:generate` chạy, snapshot + `schema.ts` commit.
- [ ] Source/Swagger tiếng Anh; không TODO ngoài plan.

## Tech Approach

- Tái dùng `StockLedgerService`, `DocumentNumberingService` (domain services, không phải "API cũ"); orchestration nằm trong handler mới.
- Inline relation, tránh N+1 khi resolve vị trí lô (xem [[feedback_inline_relations_over_root_map]]).

## Dependencies

- Requires: TKT-FND-03 (ProductLocationService + resolve), TKT-FND-02.
- Blocks: TKT-STX-02, TKT-STX-03.
