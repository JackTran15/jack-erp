# TKT-070 Return publishers & consumers (event fan-out)

## Epic

[EPIC-011 POS Return & Exchange](../epics/EPIC-011-pos-return-exchange.md)

## Summary

5 publisher + 4 idempotent consumer cho fan-out side effect của return/exchange. Mỗi consumer dedup theo unique reference key trước khi INSERT để tránh double-effect khi replay.

Refs: [plan Step 6](../../docs/plan-return-exchange.md#step-6--publishers-new), [Step 7](../../docs/plan-return-exchange.md#step-7--consumers-new).

## Deliverables

### Publishers

| File | Topic | Partition key |
|---|---|---|
| `modules/pos/publishers/return-posted.publisher.ts` | `RETURN_POSTED` | `returnInvoiceId` |
| `modules/pos/publishers/stock-return-in.publisher.ts` | `STOCK_RETURN_IN` | `returnInvoiceId` |
| `modules/customer/publishers/loyalty-points-reverse.publisher.ts` | `LOYALTY_POINTS_REVERSE` | `customerId` |
| `modules/accounting/publishers/cash-refund.publisher.ts` | `CASH_REFUND` | `cashAccountId` |
| `modules/accounting/publishers/journal-return.publisher.ts` | `JOURNAL_POST_RETURN` | `returnInvoiceId` |

### Consumers (mỗi consumer **idempotent**)

| File | Topic | Side effect | Idempotency key |
|---|---|---|---|
| `modules/inventory/consumers/stock-return-in.consumer.ts` | `STOCK_RETURN_IN` | `StockLedgerService.recordBatchMovements(RETURN_IN, +qty, referenceType='RETURN_INVOICE')` | `(referenceType, referenceId, itemId)` in `stock_ledger_entries` |
| `modules/customer/consumers/loyalty-points-reverse.consumer.ts` | `LOYALTY_POINTS_REVERSE` | Card.points -= `floor(subtotalDelta/1000)`, insert `PointHistoryEntity{type:ADJUST, delta:negative}`, floor → 0 nếu insufficient + log warning | `(invoiceId, organizationId)` in `point_history` |
| `modules/accounting/consumers/cash-refund.consumer.ts` | `CASH_REFUND` | `CashService.recordMovement(WITHDRAWAL, amount, reference=returnInvoiceCode)` | `(reference, cashAccountId, type, organizationId)` in `cash_movements` |
| `modules/accounting/consumers/journal-return.consumer.ts` | `JOURNAL_POST_RETURN` | Post **new** journal entry: DR revenue / CR cash hoặc AR hoặc credit_liability tùy `refundMethod` | `(sourceReferenceId, source='RETURN')` in `journal_entries` |

### Module wiring

- `pos.module.ts` — đăng ký 2 publisher (`returnPosted`, `stockReturnIn`).
- `customer.module.ts` — `loyaltyPointsReverse` publisher + consumer.
- `inventory.module.ts` — `stockReturnIn` consumer.
- `accounting.module.ts` — `cashRefund` + `journalReturn` publisher + consumer.

## Acceptance Criteria

- [ ] Mỗi publisher có spec test: gọi `EventPublisher.publish` đúng topic + payload shape + partition key.
- [ ] Mỗi consumer có spec test:
  - happy path: insert đúng side effect.
  - idempotency: gọi 2 lần cùng payload → side effect chỉ apply 1 lần (assert DB row count không đổi).
- [ ] `StockReturnInConsumer` dùng `referenceType='RETURN_INVOICE'` (KHÔNG `'INVOICE_CANCEL'` — tránh đụng key với `StockReturnConsumer` cũ trong INVOICE_CANCELLED).
- [ ] `JournalReturnConsumer` post **new entry** (KHÔNG reuse `JournalReverseConsumer`). Source = `JournalSource.RETURN` hoặc `EXCHANGE`.
- [ ] `CashRefundConsumer` xử lý case không có open session: nhận `cashAccountId` explicit từ payload (resolved by `CheckoutReturnService`), không lookup drawer.
- [ ] `LoyaltyPointsReverseConsumer` log warning + floor 0 nếu card.points < delta, KHÔNG fail giao dịch.
- [ ] Replay test: re-deliver message → consumer dedup, không double effect.

## Definition of Done

- [ ] 9 file mới có co-located `.spec.ts`.
- [ ] `pnpm --filter @erp/api test` pass.
- [ ] Manual: bring up redpanda, send sample message via `kafka-console-producer`, assert DB row.

## Tech Approach

Template tham khảo:
- Publisher: `apps/api/src/modules/inventory/publishers/stock-deduction.publisher.ts`.
- Consumer + idempotency: `apps/api/src/modules/inventory/consumers/stock-return.consumer.ts` (lines 33–47), `modules/customer/consumers/loyalty-points.consumer.ts` (lines 26–35).

### Payload schemas

```ts
// STOCK_RETURN_IN
{ returnInvoiceId: string, returnInvoiceCode: string, organizationId, branchId,
  lines: Array<{ itemId, locationId, quantity }>, actor: { userId } }

// LOYALTY_POINTS_REVERSE
{ returnInvoiceId, customerId, organizationId,
  subtotalDelta: number /* negative for refund, positive for net-positive exchange */ }

// CASH_REFUND
{ returnInvoiceId, returnInvoiceCode, organizationId, branchId,
  cashAccountId, contraAccountId, amount: number, sessionId?: string }

// JOURNAL_POST_RETURN
{ returnInvoiceId, returnInvoiceCode, organizationId, branchId,
  source: 'RETURN' | 'EXCHANGE',
  refundMethod: RefundMethod, refundedAmount, netAmount,
  revenueAccountId, cashAccountId?, receivableAccountId?, creditLiabilityAccountId? }

// RETURN_POSTED
{ returnInvoiceId, returnInvoiceCode, type: 'RETURN' | 'EXCHANGE',
  organizationId, branchId, customerId? }
```

### Idempotency pattern (reuse từ existing consumers)

```ts
const existing = await this.ledgerRepo.findOne({
  where: { referenceType: 'RETURN_INVOICE', referenceId: returnInvoiceId, itemId },
});
if (existing) {
  this.logger.warn(`Skip duplicate stock return ${returnInvoiceId}/${itemId}`);
  return;
}
// insert side effect
```

**Lưu ý quan trọng**: KHÔNG reuse `INVOICE_CANCELLED` topic. `StockReturnConsumer` (cancel flow) đã dedup theo `(referenceType='INVOICE_CANCEL', referenceId=invoiceId)` — partial return thứ 2 cùng invoice sẽ bị nuốt nếu reuse key. Topic riêng + key theo `returnInvoiceId` mới preserve idempotency cho nhiều partial return.

## Testing Strategy

- Spec test mỗi publisher: assert `eventPublisher.publish` call args (topic, payload shape, partition key).
- Spec test mỗi consumer: in-memory repo mock; happy path + idempotency case.
- Integration: send message qua test harness → assert DB row (defer scenario cuối tới TKT-074 e2e).

## Dependencies

- Phụ thuộc: [TKT-069](./TKT-069-return-entities-topics-and-enums.md) (topic constants + DomainEventType + entity).
- Blocks: [TKT-073](./TKT-073-checkout-return-service-and-api.md) (CheckoutReturnService publish các topic này).
