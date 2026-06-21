# TKT-GIV-01 BE: Create/Post GoodsIssue v2 (CQRS) + cột đối tượng + events

## Epic

[EPIC-18062026 Xuất kho v2](../epics/EPIC-18062026-goods-issue-v2.md)

## Layer

🟦 Backend (migration + CQRS command mới) — mirror TKT-GRV-01.

## Summary

Command CQRS mới tạo + post phiếu xuất, đối tượng **NCC hoặc Khách hàng**, autofill vị trí xuất product-uniform theo chi nhánh, ghi ledger GOODS_ISSUE với giá vốn bình quân. Endpoint cũ `POST /inventory/goods-issues` **giữ nguyên**.

## Deliverables

- `apps/api/src/database/migrations/<ts>-AddGoodsIssueCounterparty.ts` (mới, tay):
  ```sql
  CREATE TYPE goods_issue_counterparty_kind_enum AS ENUM ('supplier','customer');
  ALTER TABLE goods_issues ADD COLUMN counterparty_kind goods_issue_counterparty_kind_enum NULL;
  ALTER TABLE goods_issues ADD COLUMN counterparty_id uuid NULL;
  ```
- `apps/api/src/modules/inventory/goods-issue/goods-issue.entity.ts` — thêm `counterpartyKind?`, `counterpartyId?` (giữ `providerId`/`targetBranchId` cũ).
- `apps/api/src/modules/inventory/goods-issue/dto/create-goods-issue-v2.dto.ts` — header (`storageId`, `counterpartyKind?`, `counterpartyId?`, `purpose?`, `occurredAt?`, `references?`) + lines (`itemId`, `productId`, `locationId?`, `quantity`, `unitPrice?`, `notes?`).
- `apps/api/src/modules/inventory/goods-issue/commands/create-goods-issue-v2.{command,handler}.ts` — `@CommandHandler` (tx): assert product-uniform; resolve vị trí xuất theo kho chi nhánh; validate đối tượng; số phiếu + DRAFT; publish `inventory.goods_issue.v2.created`.
- `apps/api/src/modules/inventory/goods-issue/commands/post-goods-issue-v2.{command,handler}.ts` — `@CommandHandler` (tx): `getInstantAverageCost` mỗi item → unitPrice; `recordBatchMovements` GOODS_ISSUE (âm); `upsertUniformItemStorageLocation`; status=POSTED; publish `inventory.goods_issue.v2.posted` (eventId=`gi-posted:{id}`).
- `apps/api/src/modules/inventory/goods-issue/controllers/goods-issue-command-v2.controller.ts` — `POST /v2/inventory/goods-issues`, `POST /v2/inventory/goods-issues/:id/post`; guards + `@RequirePermission('inventory.write')` + `@RequireBranchScope()`.
- `goods-issue.module.ts` — register handlers, import `ProductLocationService`.

## Acceptance Criteria

- [ ] Đối tượng NCC **hoặc** KH; validate id khớp loại.
- [ ] Vị trí xuất autofill theo chi nhánh (bin giữ hàng); variant cùng mẫu cùng vị trí (422 nếu lệch).
- [ ] Post ghi ledger GOODS_ISSUE âm, unitPrice = giá vốn bình quân tại post; idempotent; eventId deterministic.
- [ ] Scope `organizationId` + `branchId`; endpoint cũ không đổi; data cũ hợp lệ.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass; `migration:run`/`revert` sạch.
- [ ] Spec: create (NCC & KH), product-uniform reject, post ledger + giá vốn, idempotency.
- [ ] `pnpm openapi:generate` chạy, snapshot + `schema.ts` commit.
- [ ] Source/Swagger tiếng Anh.

## Tech Approach

- Mirror TKT-GRV-01; tái dùng `getInstantAverageCost`, `StockLedgerService`, `DocumentNumberingService`. Có thể trích DTO/skeleton chung nhưng **không** gọi service cũ.

## Dependencies

- Requires: TKT-FND-03, TKT-FND-04, cột `counterparty_*`; tham chiếu TKT-GRV-01 (mirror).
- Blocks: TKT-GIV-02, TKT-GIV-03.
