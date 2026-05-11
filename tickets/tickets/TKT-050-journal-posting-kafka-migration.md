# TKT-050 Journal posting Kafka migration

## Epic

[EPIC-008 POS Event-Driven Refactor](../epics/EPIC-008-pos-event-driven-refactor.md)

## Summary

Chuyển journal posting từ sync call (`journalService.post()` trong `CheckoutInvoiceService`) sang Kafka event-driven. Publisher gửi event `erp.journal.post.sale` với key=branchId; consumer xử lý tuần tự per branch để đảm bảo document numbering sequence không bị out-of-order. DLQ retry 3x → `dead_letter_events`. Đây là use case quan trọng nhất vì hiện tại journal posting đang **fail silently** khi COA chưa seed.

## Deliverables

- Topic constant: `JOURNAL_POST_SALE = 'erp.journal.post.sale'` trong `packages/shared-kafka-client/src/topics.ts`.
- DomainEventType: `JOURNAL_POST_SALE_REQUESTED` trong shared-interfaces.
- Payload interface: `JournalPostSalePayload { invoiceId, code, branchId, amountDue, payments[], remainder, revenueAccountId, receivableAccountId?, actorId }`.
- Publisher helper: `apps/api/src/modules/accounting/publishers/journal-sale.publisher.ts`.
- Consumer: `apps/api/src/modules/accounting/consumers/journal-sale.consumer.ts`.
- Topic registration trong `topics.init.ts` với DLQ.

## Acceptance Criteria

- [ ] Kafka key = `branchId` → document numbering sequence không bị out-of-order trong cùng branch.
- [ ] Consumer build journal lines (DR payments + DR receivable, CR revenue) và call `journalService.post()`.
- [ ] **Idempotency**: dùng `journalService.findBySourceRef(invoiceId, organizationId)` — nếu đã có entry POSTED → skip.
- [ ] Consumer fail vì account không tồn tại / inactive / COA chưa seed → throw → retry 3x → DLQ → `dead_letter_events`.
- [ ] Sau khi admin seed COA xong → replay từ `dead_letter_events` → journal posted thành công.
- [ ] Không còn log `CRITICAL: Journal posting failed for invoice` trong checkout service.

## Definition of Done

- [ ] PR có topic + publisher + consumer + unit tests; pass CI.
- [ ] Unit test: publisher build payload đúng; consumer idempotent (skip nếu đã có); consumer throw khi account invalid; consumer success → POST journal.
- [ ] Integration test: publish event → verify `journal_entries` + `journal_lines` rows.
- [ ] Chaos test: COA chưa seed → publish → DLQ → seed COA → replay → success.

## Tech Approach

### Publisher

```typescript
// apps/api/src/modules/accounting/publishers/journal-sale.publisher.ts
async publishJournalForSale(
  invoice: InvoiceEntity,
  dto: { payments, revenueAccountId, receivableAccountId?, remainder, amountDue },
  actor: ActorContext,
) {
  await this.eventPublisher.publish(
    ERP_TOPICS.JOURNAL_POST_SALE,
    {
      eventId: uuid(),
      eventType: DomainEventType.JOURNAL_POST_SALE_REQUESTED,
      timestamp: new Date().toISOString(),
      organizationId: actor.organizationId,
      branchId: invoice.branchId,
      correlationId: invoice.id,
      payload: {
        invoiceId: invoice.id,
        code: invoice.code,
        branchId: invoice.branchId,
        amountDue: Number(dto.amountDue),
        remainder: Number(dto.remainder),
        revenueAccountId: dto.revenueAccountId,
        receivableAccountId: dto.receivableAccountId,
        payments: dto.payments.map(p => ({ accountId: p.accountId, amount: Number(p.amount) })),
        actorId: actor.userId,
      },
    },
    invoice.branchId, // ← Kafka key
  );
}
```

### Consumer

```typescript
// apps/api/src/modules/accounting/consumers/journal-sale.consumer.ts
@Injectable()
export class JournalSaleConsumer {
  @OnDomainEvent(ERP_TOPICS.JOURNAL_POST_SALE, { maxRetries: 3 })
  async handle(event: DomainEvent<JournalPostSalePayload>) {
    const { invoiceId, code, payments, remainder, revenueAccountId, receivableAccountId, amountDue, actorId } = event.payload;

    // Idempotency
    const existing = await this.journalService.findBySourceRef(invoiceId, event.organizationId);
    if (existing) {
      this.logger.log(`Skipped duplicate journal for invoice ${invoiceId}`);
      return;
    }

    const lines: JournalLineInput[] = [];
    let order = 1;
    for (const p of payments) {
      lines.push({ accountId: p.accountId, debitAmount: p.amount, creditAmount: 0, lineOrder: order++ });
    }
    if (remainder > 0 && receivableAccountId) {
      lines.push({ accountId: receivableAccountId, debitAmount: remainder, creditAmount: 0, lineOrder: order++ });
    }
    lines.push({ accountId: revenueAccountId, debitAmount: 0, creditAmount: amountDue, lineOrder: order });

    await this.journalService.post(
      {
        source: JournalSource.SALE,
        sourceReferenceId: invoiceId,
        description: `POS Invoice ${code}`,
        lines,
      },
      { userId: actorId, organizationId: event.organizationId, branchId: event.branchId },
    );
  }
}
```

### Topic registration

```typescript
{ topic: ERP_TOPICS.JOURNAL_POST_SALE, partitions: 3, replicationFactor: 1, dlq: true }
```

## Testing Strategy

- Unit: mock `journalService`; test idempotency, build lines đúng (balance), throw khi missing receivableAccountId mà có remainder.
- Integration: publish → verify journal_entries posted.
- Recovery: mock COA missing → DLQ → seed → replay → success.

## Dependencies

- Requires: TKT-047 (DLE), `JournalService.post()` + `JournalService.findBySourceRef()` (existing).
- Required by: TKT-051.
- Related: TKT-052 (COA seed — giảm khả năng vào DLQ).
