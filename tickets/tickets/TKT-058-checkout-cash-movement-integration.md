# TKT-058 Checkout cash movement integration

## Epic

[EPIC-009 Cash Management Enhancement](../epics/EPIC-009-cash-management-enhancement.md)

## Summary

Tích hợp `cash_movements` vào checkout invoice — khi khách hàng trả tiền mặt (`paymentMethod=CASH`), tự động tạo `cash_movement DEPOSIT` vào `cash_account` của session hiện tại. Đây là missing link giữa POS layer (`invoice_payments`) và Treasury layer (`cash_movements`). Triển khai qua Kafka consumer mới `erp.cash.movement.from.payment` để đồng nhất với event-driven pattern của EPIC-008.

## Deliverables

- Topic constant: `CASH_MOVEMENT_FROM_PAYMENT = 'erp.cash.movement.from.payment'`.
- DomainEventType: `CASH_MOVEMENT_FROM_PAYMENT_REQUESTED`.
- Payload: `CashMovementFromPaymentPayload { invoiceId, invoicePaymentId, invoiceCode, sessionId, cashAccountId, amount, branchId, actorId }`.
- Publisher: `apps/api/src/modules/accounting/publishers/cash-from-payment.publisher.ts` — publish trong `CheckoutInvoiceService` cho mỗi payment có `paymentMethod=CASH`.
- Consumer: `apps/api/src/modules/accounting/consumers/cash-from-payment.consumer.ts` — call `cashService.recordMovement()` với DEPOSIT.
- Trong `CheckoutInvoiceService` (sau khi commit invoice + payments):
  - Lookup `sessionId` của actor + `cashAccount` của session.
  - Cho mỗi `invoice_payment` có `paymentMethod=CASH`: publish event.

## Acceptance Criteria

- [ ] Kafka key = `cashAccountId` → serialize movements vào cùng 1 két.
- [ ] Consumer call `cashService.recordMovement({ type: DEPOSIT, cashAccountId, amount, contraAccountId: revenueAccount, reference: invoice.code, sessionId })`.
- [ ] Idempotency: check `cash_movements` với `reference = invoice.code AND cash_account_id = X AND amount = Y` — nếu tồn tại → skip.
- [ ] `contraAccountId` lấy từ `dto.revenueAccountId` của checkout (truyền qua payload).
- [ ] Session không active (admin checkout?) → publish vẫn chạy, consumer xử lý nhưng `sessionId=null`.
- [ ] Sau checkout: `psql SELECT balance FROM cash_accounts WHERE id = X` tăng đúng tổng cash payments.
- [ ] Trace ngược: từ `cash_movement.reference = invoice.code` → tìm được invoice + payments.

## Definition of Done

- [ ] PR có topic + publisher + consumer + checkout integration + tests; pass CI.
- [ ] Unit test: publish chỉ cho CASH payments; consumer idempotent; balance update đúng.
- [ ] Integration test: open session → checkout với CASH 300 + CARD 200 → verify 1 cash_movement DEPOSIT 300 + balance két tăng 300.
- [ ] End-to-end: checkout → close session → expected_cash phản ánh đúng tổng cash trong ca.

## Tech Approach

### Publisher in CheckoutInvoiceService

```typescript
// Sau khi commit invoice + payments transaction
const cashPayments = saved.invoicePayments.filter(p => p.paymentMethod === InvoicePaymentMethod.CASH);
if (cashPayments.length > 0) {
  const session = await this.sessionRepo.findOne({
    where: {
      cashAccountId: Not(IsNull()),
      status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES]),
      openedBy: actor.userId,
    },
  });

  for (const cp of cashPayments) {
    await this.cashFromPaymentPublisher.publish({
      invoiceId: saved.id,
      invoicePaymentId: cp.id,
      invoiceCode: saved.code,
      sessionId: session?.id,
      cashAccountId: session?.cashAccountId ?? cp.accountId, // fallback: dùng accountId từ payment
      contraAccountId: dto.revenueAccountId,
      amount: Number(cp.amount),
      branchId: saved.branchId,
      actorId: actor.userId,
    });
  }
}
```

### Consumer

```typescript
@OnDomainEvent(ERP_TOPICS.CASH_MOVEMENT_FROM_PAYMENT, { maxRetries: 3 })
async handle(event: DomainEvent<CashMovementFromPaymentPayload>) {
  const { invoiceCode, cashAccountId, amount, contraAccountId, sessionId, branchId, actorId } = event.payload;

  // Idempotency
  const existing = await this.movementRepo.findOne({
    where: {
      reference: invoiceCode,
      cashAccountId,
      amount,
      type: CashMovementType.DEPOSIT,
    },
  });
  if (existing) {
    this.logger.log(`Skipped duplicate cash movement for invoice ${invoiceCode}`);
    return;
  }

  await this.cashService.recordMovement(
    {
      cashAccountId,
      type: CashMovementType.DEPOSIT,
      amount,
      contraAccountId,
      reference: invoiceCode,
      notes: `POS sale: ${invoiceCode}`,
    },
    { userId: actorId, organizationId: event.organizationId, branchId },
  );
}
```

### Topic registration

```typescript
{ topic: ERP_TOPICS.CASH_MOVEMENT_FROM_PAYMENT, partitions: 3, replicationFactor: 1, dlq: true }
```

## Testing Strategy

- Unit: chỉ emit cho CASH; consumer idempotent; consumer call recordMovement đúng args.
- Integration: full flow open session → checkout → verify cash_movements row + balance + journal entries (DR cash 111, CR revenue 511).
- Regression: checkout với 100% CARD payment → không tạo cash_movement.

## Dependencies

- Requires: TKT-053 (type), TKT-054 (transfer), TKT-055 (journal fix), TKT-056 (session-cash link), TKT-057 (session_id auto-fill), TKT-051 (checkout đã refactor xong, có sẵn pattern publisher).
- Required by: (none — last ticket of EPIC-009).
