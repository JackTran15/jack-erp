# TKT-051 Checkout invoice event-driven refactor

## Epic

[EPIC-008 POS Event-Driven Refactor](../epics/EPIC-008-pos-event-driven-refactor.md)

## Summary

Refactor `CheckoutInvoiceService` để bỏ sync calls tới `StockLedgerService`, `MembershipCardService`, `JournalService` và thay bằng Kafka publishers (TKT-048/049/050). Bỏ compensating transaction logic (revert invoice → DRAFT + xóa payments/debt) vì business chấp nhận stock âm và downstream operations là async. Checkout flow chỉ giữ: commit invoice/payments/debts/promotions + publish 3 events + emit WebSocket.

## Deliverables

- Refactor `apps/api/src/modules/pos/services/checkout-invoice.service.ts`:
  - Inject `StockDeductionPublisher`, `LoyaltyPointsPublisher`, `JournalSalePublisher` (thay cho 3 services cũ).
  - Bỏ block try-catch + compensating transaction cho stock.
  - Bỏ try-catch journal "non-critical" (giờ là Kafka với DLQ).
  - Bỏ try-catch points "non-critical" (giờ là Kafka).
  - Bỏ stock availability validation trước transaction (business chấp nhận stock âm).
- Update test: `checkout-invoice.service.spec.ts` — adjust 18 unit tests cho flow mới.
- Update module: `pos.module.ts` — remove cũ imports, add new publishers.

## Acceptance Criteria

- [ ] `CheckoutInvoiceService` không còn import `StockLedgerService`, `MembershipCardService`, `JournalService`.
- [ ] Sau commit DB transaction (invoice + payments + debts + promotions), publish 3 events: `STOCK_DEDUCTION` (per item), `LOYALTY_POINTS_AWARD` (nếu có customer), `JOURNAL_POST_SALE`.
- [ ] Response trả về ngay sau publish, không đợi consumer process.
- [ ] Nếu publish event fail (Kafka broker down): log error nhưng KHÔNG revert invoice (invoice đã committed, broker recovery sẽ retry from outbox sau — nếu cần outbox sau này).
  - **Tạm thời**: throw 500 nếu Kafka down → user retry checkout → idempotency ở consumer xử lý duplicate.
- [ ] Stock availability validation **vẫn giữ ở client/POS UI level** (warn user) nhưng KHÔNG block server-side.
- [ ] Existing event `SALE_POSTED` vẫn được publish như cũ.

## Definition of Done

- [ ] PR refactor + adjusted tests; pass CI.
- [ ] Unit tests cover: success flow, no customer (skip points event), no remainder (skip receivable line), Kafka publish failure.
- [ ] Integration test: end-to-end checkout → verify invoice committed + 3 events published (mock consumers).
- [ ] Code review: no remaining references to `stockLedgerService`, `membershipCardService`, `journalService` in checkout service.

## Tech Approach

### Before (current)

```typescript
async checkout(...) {
  // ... validation, calculation
  const invoice = await this.dataSource.transaction(async (manager) => {
    // UPDATE invoice, INSERT payments, INSERT debts, UPDATE promotions
  });

  try {
    await this.stockLedgerService.recordBatchMovements(movements);
  } catch (stockErr) {
    // compensating: revert invoice to DRAFT, delete payments + debts
    throw new InternalServerErrorException(...);
  }

  try {
    await this.membershipCardService.awardPointsForInvoice(...);
  } catch (e) { this.logger.warn(...); }

  try {
    await this.journalService.post(...);
  } catch (e) { this.logger.error(`CRITICAL: ...`); }

  await this.eventPublisher.publish(ERP_TOPICS.SALE_POSTED, ...);
  this.wsEmitter.emitToBranch(...);
}
```

### After

```typescript
async checkout(...) {
  // ... validation, calculation
  const invoice = await this.dataSource.transaction(async (manager) => {
    // UPDATE invoice, INSERT payments, INSERT debts, UPDATE promotions
  });

  // Publish 3 events — let consumers handle downstream
  await this.stockDeductionPublisher.publishStockDeduction(items, invoice, actor);
  await this.loyaltyPointsPublisher.publishPointsAward(invoice, actor);
  await this.journalSalePublisher.publishJournalForSale(invoice, dto, actor);

  // Existing
  await this.eventPublisher.publish(ERP_TOPICS.SALE_POSTED, ...);
  this.wsEmitter.emitToBranch(...);

  return invoice;
}
```

### Removed code

- `validateStockAvailability(items)` — bỏ check trước transaction (~30 lines).
- Compensating transaction block (~40 lines).
- Try-catch journal posting (~50 lines moved to publisher).
- Try-catch points award (~20 lines moved to publisher).

Tổng: giảm ~140 lines, service rõ ràng hơn.

## Testing Strategy

- Unit test refactor:
  - Bỏ test cases: "stock unavailable → 400", "stock fail → revert", "journal fail → log only", "points fail → log only".
  - Thêm test cases: "checkout publishes 3 events with correct payloads + keys", "no customer → skip points event", "no remainder → skip receivable line in journal payload".
- Integration: mock Kafka publisher, verify call count + arguments.
- Manual: checkout invoice → curl/postman → verify response time < 200ms (vs 500ms+ trước đây).

## Dependencies

- Requires: TKT-048, TKT-049, TKT-050 (3 publishers + consumers ready).
- Related: TKT-052 (COA seed — giảm DLE volume).
- Modifies: `CheckoutInvoiceService` (TKT-040 đã hoàn thành).
