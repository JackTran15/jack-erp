# TKT-GRT-02 BE: importable picker + confirmImport nhận kho nhận + header

## Epic

[EPIC-08062026 Lập phiếu nhập kho từ chứng từ điều chuyển](../epics/EPIC-08062026-goods-receipt-from-transfer.md)

## Layer

🟦 Backend (service + controller + DTO). **KHÔNG migration** (cột do TKT-GRT-01).

## Summary

1. **Picker query** `GET /inventory/transfer-orders/importable` — lệnh `IN_PROGRESS` mà `actor.branchId` là **chi nhánh đích**, lọc khoảng ngày, inline `sourceBranchName` + số phiếu XK + tổng tiền XK.
2. **Import nhận kho nhận + header** — `ImportTransferOrderDto` + `confirmImport` nhận `destinationStorageId` (người dùng chọn) **+** `providerId/deliverer/references/occurredAt`; forward vào `GoodsReceiptService.createAndPost`.

## Deliverables

- `apps/api/src/modules/inventory/transfer-order/transfer-order.service.ts`:
  - `listImportable(params, actor)` — repo query `organizationId=actor.organizationId`, `destinationBranchId=actor.branchId`, `status=IN_PROGRESS`, `requestedDate`(fallback `createdAt`) ∈ `[from,to]`. Resolve `sourceBranchName` (join branches). Resolve **số phiếu XK + tổng tiền**: join `goods_issues` qua `exportGoodsIssueId` → `documentNumber`; tổng = `SUM(goods_issue_lines.line_total)` của phiếu XK (in-memory hoặc subquery). Map → `ImportableTransferOrderListItem[]` (inline, không trả root map). Order `createdAt DESC`.
  - Mở rộng `confirmImport(id, actor, dto)`:
    - Giữ guard `status===IN_PROGRESS` (`ConflictException`) + `actor.branchId===destinationBranchId` (`ForbiddenException`).
    - `destStorageId = dto.destinationStorageId ?? to.destinationStorageId`; `resolveLocation(destStorageId)` (như cũ).
    - Forward vào `goodsReceiptService.createAndPost`: `providerId: dto.providerId`, `deliveredBy: dto.deliverer`, `references: dto.references`, `receivedAt: dto.occurredAt ?? new Date().toISOString()`. Dòng vẫn **derive từ `to.lines`** (khóa).
- `apps/api/src/modules/inventory/transfer-order/transfer-order.controller.ts`:
  - `GET /importable` — `@RequirePermission('inventory.transfer.read')`, `@Actor()`, query DTO `{ from?, to? }` (mirror `IssuableTransferOrderQueryDto`).
  - `ImportTransferOrderDto` — thêm `@IsOptional()` `providerId @IsUUID`, `deliverer @IsString`, `references @IsArray @IsString({each})`, `occurredAt @IsDateString` (giữ `destinationStorageId`).
- `apps/api/src/modules/inventory/goods-receipt/goods-receipt.service.ts` — `createAndPost` DTO nhận `references?: string[]`; persist `receipt.references = dto.references ?? []` (providerId/deliveredBy/receivedAt đã persist sẵn).

## Acceptance Criteria

- [ ] `GET /importable` chỉ trả `IN_PROGRESS` + `destinationBranchId=actor.branchId` + đúng org + trong khoảng ngày; lệnh chi nhánh khác / `DRAFT`/`COMPLETED`/`CANCELLED` bị loại; mỗi dòng có `sourceBranchName`, `exportGoodsIssueDocumentNumber`, `totalAmount`.
- [ ] `POST /:id/import`: GoodsReceipt dùng `destinationStorageId` đã chọn; `referenceType=STOCK_TRANSFER`, `referenceId=order.id`; lệnh `COMPLETED`, `importGoodsReceiptId` set; tồn đích tăng; header (provider/deliverer/references/receivedAt) lưu lên phiếu.
- [ ] Validate: import khi không phải `IN_PROGRESS` → `409`; sai chi nhánh đích → `403`; thiếu kho nhận (cả dto lẫn header) → `400`.
- [ ] Idempotent: thừa hưởng `IdempotencyInterceptor`; state-guard chống double-import.
- [ ] Mọi query lọc `actor.organizationId`; không rò chéo tenant.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; `transfer-order.service.spec.ts` thêm case: `listImportable` scope (branch/status/date + inline XK số/tổng), `confirmImport` forward header + kho nhận, conflict/forbidden.
- [ ] Không gọi `StockLedgerService` trực tiếp — chỉ qua `GoodsReceiptService`.
- [ ] Không schema change; `synchronize` false; không Vietnamese trong source backend.

## Tech Approach

```ts
// confirmImport(...) — forward header onto the receipt
const goodsReceipt = await this.goodsReceiptService.createAndPost({
  purpose: GoodsReceiptPurpose.TRANSFER_IN,
  referenceType: GoodsReceiptReferenceType.STOCK_TRANSFER,
  referenceId: to.id,
  sourceBranchId: to.sourceBranchId,
  receivedAt: dto.occurredAt ?? new Date().toISOString(),
  providerId: dto.providerId,
  deliveredBy: dto.deliverer,
  references: dto.references,
  locationId: destLocationId,
  lines,
}, actor);
```

## Testing Strategy

- Unit (`transfer-order.service.spec.ts`): mock `goodsReceiptService.createAndPost`, assert forwarded fields; mock repos for `listImportable` scope.
- E2E để ở TKT-GRT-06.

## Dependencies

- Depends on: TKT-GRT-01. Blocks: TKT-GRT-03, TKT-GRT-05.
