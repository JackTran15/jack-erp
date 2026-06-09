# TKT-ITV-03 Service: rewrite create/getByCode/update/export/import/cancel; retire approve/markExecuted

## Epic

[EPIC-07062026 Phiếu Điều Chuyển Kho](../epics/EPIC-07062026-inventory-transfer-voucher.md)

## Layer

🟦 Backend only (service + DTOs).

## Summary

Trái tim epic. Viết lại `TransferOrderService` cho state machine 2 pha `DRAFT → IN_PROGRESS → COMPLETED` (+ `CANCELLED`), **bỏ** `approve`/`markExecuted`. Ghi tồn kho **uỷ thác** cho service có sẵn: xuất = `GoodsIssueService.createAndPost` (purpose `TRANSFER_OUT`, ledger-only), nhập = `GoodsReceiptService.createAndPost` (purpose `TRANSFER_IN`, **không** `paymentMethod`/`providerId` ⇒ không bút toán/công nợ). Lưu liên kết 2 chiều `exportGoodsIssueId` / `importGoodsReceiptId` (= import_reference). KHÔNG gọi `StockLedgerService` trực tiếp.

## Deliverables

- `apps/api/src/modules/inventory/transfer-order/transfer-order.service.ts` — inject thêm `GoodsIssueService`, `GoodsReceiptService`, repos `LocationEntity` + `ItemEntity` (resolve location/uom), `DataSource`. Bỏ phụ thuộc `StockTransferService`/`markExecuted`.
- DTO (interface `CreateTransferOrderDto` hiện đặt trong controller — mở rộng):
  - Header: `sourceBranchId`, `destinationBranchId`, `sourceStorageId?`, `destinationStorageId?`, `requestedDate?`, `notes?` (mô tả), `attachmentIds?`.
  - Line: `itemId`, `requestedQty` (`@Min(0.001)`), `sourceStorageId?`, `destinationStorageId?`, `note?`.
- `update-transfer-order.dto.ts` (mới hoặc inline) — DRAFT: full; IN_PROGRESS: chỉ `notes?` + `attachmentIds?`.

### Public methods

- `create(dto, actor)` — DRAFT; sinh `documentNumber` qua `DocumentNumberingService.generate(DocumentType.TRANSFER_ORDER, actor.branchId, actor)` (LDC); validate lines≠rỗng, qty>0; lưu header+lines (tx, org+branch scoped).
- `getById(id, organizationId)` / `getByCode(documentNumber, organizationId)` — **org-scoped** (không lọc branch) để 2 phía load được; `getByCode` = tiện ích load theo mã.
- `list(query, actor)` — paginated, scope org, lọc status/branch/search (theo `documentNumber`).
- `update(id, dto, actor)` — `DRAFT`: thay toàn bộ header+lines (wholesale line replace). `IN_PROGRESS`: chỉ patch `notes`/`attachmentIds`; field khác → `BadRequestException`. `COMPLETED`/`CANCELLED` → `BadRequestException`.
- `confirmExport(id, actor)` — guard `status===DRAFT` (else `ConflictException`) + `actor.branchId===order.sourceBranchId` (`ForbiddenException`). Resolve mỗi line: `line.sourceStorageId ?? header.sourceStorageId` → unassigned location của storage. Gọi `goodsIssueService.createAndPost({ locationId: defaultSourceLocation, purpose: TRANSFER_OUT, targetBranchId: order.destinationBranchId, reason: 'TRANSFER_ORDER ' + documentNumber, lines: [{itemId, locationId, quantity: requestedQty}] })`. Trong tx: `status=IN_PROGRESS`, `exportGoodsIssueId=gi.id`, `exportedAt/By`. Publish `inventory.transfer-order.exported`.
- `confirmImport(id, actor)` — guard `status===IN_PROGRESS` + `actor.branchId===order.destinationBranchId`. Resolve `line.destinationStorageId ?? header.destinationStorageId` → location đích, + `uomCode` từ đơn vị gốc item, `unitPrice` = cost (hoặc 0). Gọi `goodsReceiptService.createAndPost({ purpose: TRANSFER_IN, referenceType: STOCK_TRANSFER, referenceId: order.id, sourceBranchId: order.sourceBranchId, receivedAt: now, locationId: defaultDestLocation, lines: [{itemId, locationId, uomCode, quantity: requestedQty, unitPrice}] })` — **không** paymentMethod/providerId. `status=COMPLETED`, `importGoodsReceiptId=gr.id`, `completedAt/By`. Publish `inventory.transfer-order.completed`.
- `cancel(id, actor)` — `DRAFT`: `status=CANCELLED` + soft-delete (no ledger). `IN_PROGRESS`: `goodsIssueService.cancel(exportGoodsIssueId, actor)` (ADJUSTMENT_INCREASE hồi tồn Store A) → `status=CANCELLED`, `cancelledAt/By`. `COMPLETED`/`CANCELLED` → `ConflictException`.
- **Xoá** `approve()` + `markExecuted()`; grep & xử lý mọi caller (đặc biệt controller cũ `POST /:id/execute` và bất kỳ liên kết `StockTransferService`).

## Acceptance Criteria

- [ ] `getById`/`getByCode`/`list` lọc theo `actor.organizationId`; `getByCode` org-scoped (cross-branch loadable).
- [ ] `confirmExport`: chỉ khi `DRAFT` + đúng branch nguồn; spawn 1 GoodsIssue `TRANSFER_OUT`, `targetBranchId=destinationBranchId`, ledger out theo **kho nguồn từng dòng**; tồn âm vẫn xuất (không tự chặn).
- [ ] `confirmImport`: chỉ khi `IN_PROGRESS` + đúng branch đích; spawn 1 GoodsReceipt `TRANSFER_IN` (referenceType STOCK_TRANSFER, referenceId=order.id), ledger in theo **kho đích từng dòng**; **không** sinh journal/cash/supplier-debt; set import_reference.
- [ ] `update` ở `IN_PROGRESS` chỉ cho `notes`/`attachmentIds`; không có đường tự nhảy `COMPLETED`.
- [ ] `cancel` từ `IN_PROGRESS` đảo đúng leg xuất; từ `DRAFT` không tác động ledger.
- [ ] Không còn `approve`/`markExecuted`; không caller chết; build BE xanh.
- [ ] Idempotent: mutation thừa hưởng `IdempotencyInterceptor`; state-guard chống double-export/import.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass; spec `transfer-order.service.spec.ts` cập nhật: happy path mỗi method, 404, conflict sai trạng thái, forbidden sai branch, export tồn âm, cancel-reverse, per-line storage resolve.
- [ ] Không gọi `StockLedgerService` trực tiếp; chỉ qua GoodsIssue/GoodsReceipt.
- [ ] Không Vietnamese trong source backend.
- [ ] Không đổi schema ngoài TKT-ITV-01.

## Tech Approach

```ts
async confirmImport(id: string, actor: ActorContext): Promise<TransferOrderEntity> {
  const o = await this.getById(id, actor.organizationId);
  if (o.status !== TransferOrderStatus.IN_PROGRESS)
    throw new ConflictException('Transfer order is not IN_PROGRESS');
  if (actor.branchId !== o.destinationBranchId)
    throw new ForbiddenException('Import must be confirmed from the destination branch');

  const lines = await Promise.all(o.lines.map(async (l) => {
    const storageId = l.destinationStorageId ?? o.destinationStorageId;
    return {
      itemId: l.itemId,
      locationId: await this.resolveLocation(storageId, actor.organizationId),
      uomCode: await this.resolveUom(l.itemId, actor.organizationId),
      quantity: Number(l.requestedQty),
      unitPrice: 0,
    };
  }));

  const gr = await this.goodsReceiptService.createAndPost({
    purpose: GoodsReceiptPurpose.TRANSFER_IN,
    referenceType: GoodsReceiptReferenceType.STOCK_TRANSFER,
    referenceId: o.id,
    sourceBranchId: o.sourceBranchId,
    receivedAt: new Date().toISOString(),
    locationId: lines[0].locationId,
    lines,
  }, actor);

  return this.dataSource.transaction(async (m) => {
    await m.update(TransferOrderEntity, id, {
      status: TransferOrderStatus.COMPLETED,
      importGoodsReceiptId: gr.id,
      completedAt: new Date(),
      completedBy: actor.userId,
    });
    return this.getById(id, actor.organizationId);
  });
}
```

> `GoodsReceiptLineDto` bắt buộc `uomCode`+`unitPrice`+`locationId`; `GoodsIssueLineDto.unitPrice` optional. Negative-stock: KHÔNG thêm check chặn (ledger chỉ warn) — cảnh báo client-side. `resolveLocation(storageId)` = location `isUnassigned=true` của storage; lỗi rõ nếu thiếu.

## Testing Strategy

- Unit: mock GoodsIssue/GoodsReceipt/DocumentNumbering; assert transitions, branch guards, spawn payload (purpose/targetBranchId/referenceType), per-line storage→location, import_reference.
- Tích hợp ledger thật ở E2E (TKT-ITV-09).

## Dependencies

- Depends on: TKT-ITV-01.
- Blocks: TKT-ITV-04, TKT-ITV-09.
