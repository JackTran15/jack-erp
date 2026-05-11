# TKT-048 Stock deduction Kafka migration

## Epic

[EPIC-008 POS Event-Driven Refactor](../epics/EPIC-008-pos-event-driven-refactor.md)

## Summary

Chuyển stock deduction từ sync call (`stockLedgerService.recordBatchMovements()` trong `CheckoutInvoiceService`) sang Kafka event-driven. Publisher gửi event `erp.stock.deduction` với key=productId; consumer xử lý tuần tự từng product để tránh race condition. DLQ retry 3x → `dead_letter_events`.

## Deliverables

- Topic constant: `STOCK_DEDUCTION = 'erp.stock.deduction'` trong `packages/shared-kafka-client/src/topics.ts`.
- DomainEventType: `STOCK_DEDUCTION_REQUESTED` trong `packages/shared-interfaces/src/events/index.ts`.
- Payload interface: `StockDeductionPayload { invoiceId, itemId, productId, locationId, quantity, branchId, actorId }`.
- Publisher helper: `apps/api/src/modules/inventory/publishers/stock-deduction.publisher.ts` (wrap `eventPublisher.publish` với key=productId).
- Consumer: `apps/api/src/modules/inventory/consumers/stock-deduction.consumer.ts` (decorated với `@OnDomainEvent(STOCK_DEDUCTION)`).
- Topic registration trong `topics.init.ts` với DLQ.

## Acceptance Criteria

- [ ] Publisher gửi 1 event per item (không batch) để partition theo productId hoạt động đúng.
- [ ] Kafka key = `productId` → cùng product luôn vào cùng partition → consumer xử lý tuần tự.
- [ ] Consumer call `stockLedgerService.recordBatchMovements()` với movement đơn lẻ (type=SALE_ISSUE, quantity âm).
- [ ] **Idempotency**: trước khi insert, query `stock_ledger` với `reference_type='INVOICE' AND reference_id=invoiceId AND item_id=itemId` — nếu đã tồn tại → skip + log info.
- [ ] Consumer fail 3 lần → message vào DLQ → `dead_letter_events` có row PENDING.
- [ ] Replay từ admin API thành công → stock được trừ đúng (idempotency đảm bảo không double-deduct).
- [ ] Stock có thể âm — không validate availability ở consumer (business chấp nhận).

## Definition of Done

- [ ] PR có topic + publisher + consumer + unit tests; pass CI.
- [ ] Unit test: publisher emit đúng key + payload; consumer process success; consumer idempotent (gọi 2 lần → 1 lần insert); consumer fail → throw để Kafka retry.
- [ ] Integration test: publish event → wait → verify row trong `stock_ledger`.

## Tech Approach

### Publisher

```typescript
// apps/api/src/modules/inventory/publishers/stock-deduction.publisher.ts
async publishStockDeduction(items: InvoiceItem[], invoice: InvoiceEntity, actor: ActorContext) {
  for (const item of items) {
    if (!item.locationId) continue; // chỉ deduct items có location
    await this.eventPublisher.publish(
      ERP_TOPICS.STOCK_DEDUCTION,
      {
        eventId: uuid(),
        eventType: DomainEventType.STOCK_DEDUCTION_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: invoice.branchId,
        correlationId: invoice.id,
        payload: {
          invoiceId: invoice.id,
          itemId: item.itemId,
          productId: item.productId,
          locationId: item.locationId,
          quantity: Number(item.quantity),
          branchId: invoice.branchId,
          actorId: actor.userId,
        },
      },
      item.productId, // ← Kafka key
    );
  }
}
```

### Consumer

```typescript
// apps/api/src/modules/inventory/consumers/stock-deduction.consumer.ts
@Injectable()
export class StockDeductionConsumer {
  @OnDomainEvent(ERP_TOPICS.STOCK_DEDUCTION, { maxRetries: 3 })
  async handle(event: DomainEvent<StockDeductionPayload>) {
    const { invoiceId, itemId, locationId, quantity, branchId, actorId } = event.payload;

    // Idempotency check
    const existing = await this.stockLedgerRepo.findOne({
      where: { referenceType: 'INVOICE', referenceId: invoiceId, itemId },
    });
    if (existing) {
      this.logger.log(`Skipped duplicate stock deduction for invoice ${invoiceId} item ${itemId}`);
      return;
    }

    await this.stockLedgerService.recordBatchMovements([{
      itemId,
      locationId,
      branchId,
      organizationId: event.organizationId,
      movementType: StockMovementType.SALE_ISSUE,
      quantity: -quantity,
      referenceType: 'INVOICE',
      referenceId: invoiceId,
      actorContext: { userId: actorId, organizationId: event.organizationId, branchId },
    }]);
  }
}
```

### Topic registration

```typescript
// apps/api/src/modules/events/topics.init.ts
{ topic: ERP_TOPICS.STOCK_DEDUCTION, partitions: 6, replicationFactor: 1, dlq: true }
```

## Testing Strategy

- Unit: mock `stockLedgerService`, `stockLedgerRepo`; test idempotency (return early khi existing), test happy path.
- Integration: spin up test broker → publish event → wait 1s → query `stock_ledger`.
- Chaos: mock `stockLedgerService.recordBatchMovements()` throw 4 lần → verify DLQ → `dead_letter_events`.

## Dependencies

- Requires: TKT-047 (DLE infrastructure), `StockLedgerService` (TKT-010).
- Required by: TKT-051 (checkout refactor).
