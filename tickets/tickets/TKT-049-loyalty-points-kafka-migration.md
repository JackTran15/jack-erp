# TKT-049 Loyalty points Kafka migration

## Epic

[EPIC-008 POS Event-Driven Refactor](../epics/EPIC-008-pos-event-driven-refactor.md)

## Summary

Chuyển loyalty points award từ sync call (`membershipCardService.awardPointsForInvoice()` trong `CheckoutInvoiceService`) sang Kafka event-driven. Publisher gửi event `erp.loyalty.points.award` với key=customerId; consumer xử lý tuần tự per customer để tránh race condition trên `membership_cards.balance`. DLQ retry 3x → `dead_letter_events`.

## Deliverables

- Topic constant: `LOYALTY_POINTS_AWARD = 'erp.loyalty.points.award'` trong `packages/shared-kafka-client/src/topics.ts`.
- DomainEventType: `LOYALTY_POINTS_AWARD_REQUESTED` trong shared-interfaces.
- Payload interface: `LoyaltyPointsAwardPayload { invoiceId, customerId, subtotal, issuedAt, branchId, actorId }`.
- Publisher helper: `apps/api/src/modules/customer/publishers/loyalty-points.publisher.ts`.
- Consumer: `apps/api/src/modules/customer/consumers/loyalty-points.consumer.ts` (decorated với `@OnDomainEvent`).
- Topic registration trong `topics.init.ts` với DLQ.

## Acceptance Criteria

- [ ] Publisher chỉ emit khi invoice có `customerId` (không có customer → skip).
- [ ] Kafka key = `customerId` → balance updates per customer được serialize.
- [ ] Consumer call `membershipCardService.awardPointsForInvoice()`.
- [ ] **Idempotency**: trước khi award, check `point_history.invoice_id = X` — nếu đã tồn tại → skip.
- [ ] Customer không có membership card active → log warn + skip (không throw để Kafka không retry).
- [ ] Consumer fail (DB error, etc.) → throw để retry → 3x → DLQ → `dead_letter_events`.

## Definition of Done

- [ ] PR có topic + publisher + consumer + unit tests; pass CI.
- [ ] Unit test: publisher chỉ emit khi có customerId; consumer process success; consumer idempotent; consumer skip khi không có membership card; consumer throw khi DB error.
- [ ] Integration test: publish event → verify `point_history` row + `membership_cards.balance` update.

## Tech Approach

### Publisher

```typescript
// apps/api/src/modules/customer/publishers/loyalty-points.publisher.ts
async publishPointsAward(invoice: InvoiceEntity, actor: ActorContext) {
  if (!invoice.customerId) return;

  await this.eventPublisher.publish(
    ERP_TOPICS.LOYALTY_POINTS_AWARD,
    {
      eventId: uuid(),
      eventType: DomainEventType.LOYALTY_POINTS_AWARD_REQUESTED,
      timestamp: new Date().toISOString(),
      organizationId: actor.organizationId,
      branchId: invoice.branchId,
      correlationId: invoice.id,
      payload: {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        subtotal: Number(invoice.subtotal),
        issuedAt: invoice.issuedAt?.toISOString(),
        branchId: invoice.branchId,
        actorId: actor.userId,
      },
    },
    invoice.customerId, // ← Kafka key
  );
}
```

### Consumer

```typescript
// apps/api/src/modules/customer/consumers/loyalty-points.consumer.ts
@Injectable()
export class LoyaltyPointsConsumer {
  @OnDomainEvent(ERP_TOPICS.LOYALTY_POINTS_AWARD, { maxRetries: 3 })
  async handle(event: DomainEvent<LoyaltyPointsAwardPayload>) {
    const { invoiceId, customerId, subtotal } = event.payload;

    // Idempotency check
    const existing = await this.pointHistoryRepo.findOne({
      where: { invoiceId, organizationId: event.organizationId },
    });
    if (existing) {
      this.logger.log(`Skipped duplicate points award for invoice ${invoiceId}`);
      return;
    }

    try {
      await this.membershipCardService.awardPointsForInvoice(
        { id: invoiceId, customerId, subtotal },
        { userId: event.payload.actorId, organizationId: event.organizationId, branchId: event.branchId },
      );
    } catch (e) {
      if (e instanceof NoMembershipCardError) {
        this.logger.warn(`Customer ${customerId} has no active membership card, skipping`);
        return; // không throw → không retry
      }
      throw e; // DB / unexpected errors → retry
    }
  }
}
```

### Topic registration

```typescript
{ topic: ERP_TOPICS.LOYALTY_POINTS_AWARD, partitions: 3, replicationFactor: 1, dlq: true }
```

## Testing Strategy

- Unit: mock `membershipCardService`, `pointHistoryRepo`; test idempotency, no-card skip, error retry.
- Integration: publish → verify points balance update.

## Dependencies

- Requires: TKT-047 (DLE), `MembershipCardService` (TKT-042), `point_history` entity.
- Required by: TKT-051.
