# TKT-CTW-03 BE: checkout publish sự kiện fulfill

## Epic

[EPIC-25062026 Checkout ↔ Kho tạm](../epics/EPIC-25062026-checkout-temp-warehouse-fulfillment.md)

## Summary

Sau khi checkout lưu hóa đơn non-draft, publish thêm `TEMP_WAREHOUSE_INVOICE_FULFILL_REQUESTED` mang danh sách `{itemId, quantity}` của hóa đơn + `invoiceId`/`invoiceNumber`/`branchId`/`actor`. EventId tất định = `invoiceId` để consumer idempotent. Không thay đổi luồng `STOCK_DEDUCTION_REQUESTED` hiện có.

## Deliverables

- `apps/api/src/modules/inventory/publishers/temp-warehouse-fulfill.publisher.ts` (new) hoặc thêm method vào publisher hiện có — `publish(payload, { eventId: invoiceId })`.
- `apps/api/src/modules/pos/services/checkout-invoice.service.ts` — sau khi save invoice + publish stock-deduction, gọi publisher fulfill với các dòng đã gộp theo `itemId` (sum quantity). Publish **bất kể** có phiên kho tạm hay không (consumer tự no-op nếu không có phiên/không khớp) để giữ checkout đơn giản, không thêm truy vấn chặn.
- Wire publisher vào module liên quan (provider).

## Acceptance Criteria

- [ ] Checkout 1 hóa đơn → publish đúng 1 event fulfill, `eventId === invoiceId`, payload chứa đủ dòng `{itemId, quantity}` (gộp trùng item), `invoiceNumber` đúng số phiếu.
- [ ] Không đổi số lượng/định dạng event `STOCK_DEDUCTION_REQUESTED`.
- [ ] Publish nằm sau khi invoice đã persist non-draft (không publish cho hóa đơn còn draft / checkout thất bại).
- [ ] Idempotency interceptor của checkout không bị ảnh hưởng (cùng key + body → replay vẫn 1 event nhờ eventId tất định + dedupe consumer).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint pass; spec mock event bus, assert payload + eventId.
- [ ] No Vietnamese trong source.
- [ ] Không truy vấn DB nặng thêm trong checkout (chỉ map dòng sẵn có).

## Tech Approach

```ts
// trong CheckoutInvoiceService.checkout(), sau khi invoice saved + stock-deduction published
const fulfillLines = aggregateByItem(invoice.items); // [{ itemId, quantity }]
await this.tempWarehouseFulfillPublisher.publish(
  {
    organizationId: actor.organizationId,
    branchId: actor.branchId!,
    invoiceId: invoice.id,
    invoiceNumber: invoice.code,
    actor: { userId: actor.userId, organizationId: actor.organizationId, branchId: actor.branchId },
    lines: fulfillLines,
  },
  { eventId: invoice.id },
);
```

## Testing Strategy

- Unit (`checkout-invoice.service.spec.ts`): mock publisher; assert được gọi đúng 1 lần với payload gộp item + eventId = invoiceId; assert vẫn publish stock-deduction.

## Dependencies

- Depends on: TKT-CTW-02.
- Blocks: TKT-CTW-04.
