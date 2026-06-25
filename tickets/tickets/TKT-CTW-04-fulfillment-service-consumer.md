# TKT-CTW-04 BE: fulfillment service + consumer (khớp + tách FIFO + transfer, idempotent)

## Epic

[EPIC-25062026 Checkout ↔ Kho tạm](../epics/EPIC-25062026-checkout-temp-warehouse-fulfillment.md)

## Summary

Trái tim của epic. Consumer nghe `TEMP_WAREHOUSE_INVOICE_FULFILL_REQUESTED`, gọi `TempWarehouseService.fulfillInvoiceFromTempWarehouse(payload, actor)`. Service: tìm phiên kho tạm ACTIVE của branch; với mỗi item, khớp các dòng `warehouse_to_showroom` ACTIVE **FIFO theo `createdAt`**; tiêu thụ `min(saleQty, tổng tempQty)`; **tách dòng** (phần tiêu thụ → TRANSFERRED + `invoiceId`/`invoiceNumber`; phần dư → 1 dòng ACTIVE mới theo pattern `supersededById`); gọi `StockTransferService.createAndPost` tạo phiếu CK `kho lưu trữ → showroom` qua materializer sẵn có, mô tả `"Chuyển kho bán hàng hóa từ phiếu xuất đi tại kho tạm theo hóa đơn số <invoiceNumber>"`, gắn `invoiceId`; gán `transferId` cho dòng tiêu thụ. Idempotent.

## Deliverables

- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.ts` — method mới `fulfillInvoiceFromTempWarehouse(payload, actor)`:
  - Transaction-wrapped. Nếu không có phiên ACTIVE → no-op (return rỗng).
  - Per item: lấy dòng W2S ACTIVE (kèm `supersededById` resolution) sort `createdAt ASC`; tính `consumeQty = min(payload.qty, Σ tempQty)`.
  - Tách dòng: dùng lại logic supersede — dòng tiêu thụ một phần được split thành (consumed → TRANSFERRED, remainder → ACTIVE mới). Gắn `invoiceId`/`invoiceNumber` lên dòng TRANSFERRED.
  - Build `BranchScopedTransferInput` qua `TempWarehouseTransferMaterializerService` (source = warehouse location của phiên / `sourceLocationId` dòng; dest = showroom default) cho tổng `consumeQty` mỗi item.
  - `StockTransferService.createAndPost(input, { invoiceId, invoiceNumber, description })`; nhận `transferId`; gán vào dòng tiêu thụ.
- `apps/api/src/modules/inventory/temp-warehouse/consumers/temp-warehouse-fulfill.consumer.ts` (new) — subscribe topic, dedupe `processed_events` theo `eventId` (= invoiceId), gọi service; xử lý lỗi → DLQ như consumer transfer hiện có.
- `temp-warehouse.module.ts` — đăng ký consumer.
- (Nếu `StockTransferService.createAndPost` chưa nhận invoice context) mở rộng input để set `invoiceId`/`invoiceNumber`/`notes` lên `stock_transfers`.

## Acceptance Criteria

- [ ] Item có tempQty ≥ saleQty: transfer đúng `saleQty`; dòng kho tạm còn `tempQty − saleQty` ACTIVE; phần tiêu thụ TRANSFERRED + `invoiceId`/`transferId`.
- [ ] Item có tempQty < saleQty: transfer đúng `tempQty` (toàn bộ dòng tiêu thụ TRANSFERRED); phần thiếu **không** transfer (SALE_ISSUE showroom gánh phần còn lại — không thuộc ticket này).
- [ ] Khớp FIFO theo `createdAt` khi item có nhiều dòng W2S ACTIVE.
- [ ] Không phiên ACTIVE / item không có dòng W2S ACTIVE → bỏ qua item, không tạo transfer.
- [ ] Phiếu CK: source = kho lưu trữ, dest = showroom, qty = `min`, `invoiceId` set, mô tả đúng template; chỉ 1 phiếu CK/đợt fulfill (gộp các item cùng chiều), hoặc 1 phiếu/item — chốt 1 phiếu/đợt cho khớp ảnh #2 (1 dòng/phiếu là do 1 item).
- [ ] **Idempotent:** replay cùng `eventId` (invoiceId) → không tạo transfer thứ hai, không tách dòng lần hai (kiểm `processed_events` + dòng đã TRANSFERRED mang đúng `invoiceId`).
- [ ] Tất cả truy vấn scope `organizationId` + `branchId` của phiên.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint pass.
- [ ] Spec phủ: tempQty≥saleQty (split), tempQty<saleQty (full consume), nhiều dòng FIFO, no-session no-op, replay idempotent.
- [ ] Tái dùng materializer + `createAndPost` (không viết lại logic ledger).
- [ ] No Vietnamese trong source; chuỗi mô tả phiếu (Vietnamese) là **dữ liệu nghiệp vụ** đặt qua constant rõ ràng — chấp nhận như notes/description người dùng đọc (giống các phiếu khác), không phải log/error.
- [ ] Không TODO/FIXME ngoài plan.

## Tech Approach

```ts
async fulfillInvoiceFromTempWarehouse(
  p: TempWarehouseInvoiceFulfillRequestedPayload,
  actor: ActorContext,
): Promise<void> {
  await this.dataSource.transaction(async (m) => {
    const session = await this.findActiveSession(m, p.branchId, actor);
    if (!session) return; // no-op
    const consumed: ConsumedLine[] = [];
    for (const line of p.lines) {
      const active = await this.activeW2sLinesForItem(m, session.id, line.itemId); // FIFO createdAt ASC
      let need = line.quantity;
      for (const tl of active) {
        if (need <= 0) break;
        const take = Math.min(need, Number(tl.quantity));
        await this.splitAndConsume(m, tl, take, { invoiceId: p.invoiceId, invoiceNumber: p.invoiceNumber });
        consumed.push({ itemId: line.itemId, qty: take, sourceLocationId: tl.sourceLocationId });
        need -= take;
      }
    }
    if (!consumed.length) return;
    const input = this.materializer.buildBranchScopedTransfer(session, consumed, {
      description: `Chuyển kho bán hàng hóa từ phiếu xuất đi tại kho tạm theo hóa đơn số ${p.invoiceNumber}`,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoiceNumber,
    });
    const transfer = await this.stockTransferService.createAndPost(input, m);
    await this.markConsumedTransferred(m, consumed, transfer.id, p.invoiceId, p.invoiceNumber);
  });
}
```

## Testing Strategy

- Unit (`temp-warehouse.service.spec.ts`): seed phiên + dòng W2S; assert split/consume/transfer/mark cho từng case; mock `createAndPost`.
- Idempotency: gọi service 2 lần cùng payload → 1 transfer (kiểm guard processed_events ở consumer spec).

## Dependencies

- Depends on: TKT-CTW-02, TKT-CTW-03.
- Blocks: TKT-CTW-07, TKT-CTW-08, TKT-CTW-09.
