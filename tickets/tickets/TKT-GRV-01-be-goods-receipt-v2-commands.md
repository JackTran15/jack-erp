# TKT-GRV-01 BE: Create/Post GoodsReceipt v2 (CQRS) + cột đối tượng + events

## Epic

[EPIC-18062026 Nhập kho v2](../epics/EPIC-18062026-goods-receipt-v2.md)

## Layer

🟦 Backend (migration + CQRS command mới).

## Summary

Command CQRS mới tạo + post phiếu nhập, đối tượng **NCC hoặc Khách hàng**, autofill vị trí product-uniform theo chi nhánh, ghi ledger + công nợ. Endpoint cũ `POST /goods-receipts` **giữ nguyên**.

## Deliverables

- `apps/api/src/database/migrations/<ts>-AddGoodsReceiptCounterparty.ts` (mới, tay):
  ```sql
  CREATE TYPE goods_receipt_counterparty_kind_enum AS ENUM ('supplier','customer');
  ALTER TABLE goods_receipts ADD COLUMN counterparty_kind goods_receipt_counterparty_kind_enum NULL;
  ALTER TABLE goods_receipts ADD COLUMN counterparty_id uuid NULL;
  ```
- `apps/api/src/modules/inventory/goods-receipt/goods-receipt.entity.ts` — thêm `counterpartyKind?`, `counterpartyId?` (giữ `providerId` cũ cho tương thích).
- `apps/api/src/modules/inventory/goods-receipt/dto/create-goods-receipt-v2.dto.ts` — header (`storageId`, `counterpartyKind?`, `counterpartyId?`, `receivedAt`, `paymentMethod?`, `references?`, …) + lines (`itemId`, `productId`, `locationId?`, `quantity`, `unitPrice`, `note?`).
- `apps/api/src/modules/inventory/goods-receipt/commands/create-goods-receipt-v2.{command,handler}.ts` — `@CommandHandler` (tx):
  - `productLocationService.assertProductUniformLocation(lines)`; resolve `locationId` trống theo kho chi nhánh (ResolveItemLocations).
  - validate `counterparty_kind`/`counterparty_id` khớp NCC (providers) hoặc KH (customers).
  - số phiếu + insert DRAFT; publish `inventory.goods_receipt.v2.created`.
- `apps/api/src/modules/inventory/goods-receipt/commands/post-goods-receipt-v2.{command,handler}.ts` — `@CommandHandler` (tx):
  - `recordBatchMovements` PURCHASE_RECEIPT; nếu CREDIT + NCC → ghi công nợ 331 (`SupplierDebtEntity`); nếu CASH → recordMovement tiền.
  - `upsertUniformItemStorageLocation` (variant cùng mẫu → cùng vị trí nhập).
  - status=POSTED; publish `inventory.goods_receipt.v2.posted` (eventId=`gr-posted:{id}`).
- `apps/api/src/modules/inventory/goods-receipt/controllers/goods-receipt-command-v2.controller.ts` — `POST /v2/inventory/goods-receipts`, `POST /v2/inventory/goods-receipts/:id/post`; guards + `@RequirePermission('inventory.write')` + `@RequireBranchScope()`.
- `goods-receipt.module.ts` — register handlers, import `ProductLocationService`.

## Acceptance Criteria

- [ ] Đối tượng chọn được NCC **hoặc** KH; validate id khớp loại; CREDIT+NCC ghi công nợ 331.
- [ ] Vị trí từng dòng autofill theo chi nhánh; variant cùng mẫu mã cùng vị trí (reject 422 nếu lệch).
- [ ] Post ghi ledger PURCHASE_RECEIPT; idempotent replay; eventId deterministic.
- [ ] Scope `organizationId` + `branchId`.
- [ ] Endpoint cũ không đổi; migration để data cũ hợp lệ (`counterparty_*` null).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass; `migration:run`/`revert` sạch.
- [ ] Spec: create happy (NCC & KH), product-uniform reject, post ledger + công nợ, idempotency.
- [ ] `pnpm openapi:generate` chạy, snapshot + `schema.ts` commit.
- [ ] Source/Swagger tiếng Anh.

## Tech Approach

- Tái dùng `StockLedgerService`, công nợ NCC, `DocumentNumberingService` (domain services). Handler v2 tự orchestrate, không gọi service cũ `GoodsReceiptService.createAndPost`.

## Dependencies

- Requires: TKT-FND-03, TKT-FND-04 (đối tượng), cột `counterparty_*`.
- Blocks: TKT-GRV-02, TKT-GRV-03.
