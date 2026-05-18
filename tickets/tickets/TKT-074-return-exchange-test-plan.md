# TKT-074 Return/Exchange test plan & DoD gate

## Epic

[EPIC-011 POS Return & Exchange](../epics/EPIC-011-pos-return-exchange.md)

## Summary

Acceptance gate cho EPIC-011: e2e flow theo 4 sequence diagram + unit coverage + regression + docs update + OpenAPI snapshot.

Refs: [plan Step 11](../../docs/plan-return-exchange.md#step-11--testing), [Verification](../../docs/plan-return-exchange.md#verification).

## Deliverables

- `apps/api/test/e2e/return-exchange.e2e-spec.ts` (~10 scenario, largest e2e in repo).
- Manual verification script `scripts/verify-return-exchange.sh` (chạy local sau `make dev-api`).
- Cập nhật OpenAPI snapshot + `packages/api-client`.
- Cập nhật docs:
  - [docs/10-pos-module.md](../../docs/10-pos-module.md) — section "Đổi trả hàng".
  - [docs/13-workflows-and-state-machines.md](../../docs/13-workflows-and-state-machines.md) — state diagram RETURN/EXCHANGE lifecycle.
  - [docs/entities](../../docs/entities/) — regenerate qua `pnpm docs:entities`.

## Acceptance Criteria

### E2E scenarios (theo 4 sequence diagram)

- [ ] **Flow 1 — Quick return + CASH**: `POST /invoices/returns` mode=quick → `POST /invoices/:id/checkout-return` refund=CASH → assert:
  - `stock_balances` tăng đúng qty.
  - `cash_movements` có WITHDRAWAL với reference = invoice code.
  - `journal_entries` có entry source=RETURN, balanced.
- [ ] **Flow 2 — Regular partial + STORE_CREDIT**: tạo SALE 5 units → return 2 → checkout STORE_CREDIT → assert:
  - `invoice_items.returned_quantity = 2` trên invoice gốc.
  - `customer_credits` row mới, `remainingAmount = refundedAmount`.
  - `stock_balances` tăng đúng 2 units.
  - `point_history` có ADJUST với delta âm.
- [ ] **Flow 3 — Exchange net < 0 + CASH**: trả 500k mua 300k → checkout CASH → cash_movements WITHDRAWAL 200k, stock có cả deduction lẫn return-in.
- [ ] **Flow 4 — Exchange net > 0**: trả 300k mua 500k → require payments 200k → CASH_MOVEMENT_FROM_PAYMENT, không phát CASH_REFUND.

### Edge cases

- [ ] Over-return guard: trả qty=10 khi sold=5 → 400.
- [ ] Concurrency: 2 partial return song song cùng original line → second nhận 409.
- [ ] Loyalty insufficient: card.points=50, refund 100 points worth → card.points floor 0, không throw.
- [ ] OFFSET vs SALE PAID (no debt): reject với 400 hoặc accept với `refundedAmount=0` chỉ EXCHANGE.
- [ ] Cross-org access: actor org A truy cập return của org B → 404.

### Regression (no break)

- [ ] SALE checkout `POST /invoices/:id/checkout` vẫn pass test cũ (do TKT-072 extract shared helpers).
- [ ] `cancel-invoice.service` reject cancel của RETURN invoice → 400 (returns không tự cancel v1).
- [ ] INVOICE_CANCELLED flow trên SALE invoice vẫn revert stock đúng (không double-count với STOCK_RETURN_IN).
- [ ] Loyalty earn trên SALE vẫn hoạt động.
- [ ] Promotion apply trên SALE vẫn hoạt động.

### Idempotency

- [ ] Replay từng topic (`STOCK_RETURN_IN`, `CASH_REFUND`, `LOYALTY_POINTS_REVERSE`, `JOURNAL_POST_RETURN`) → no double effect.

### Documentation

- [ ] `docs/10-pos-module.md` thêm sub-section "Đổi trả hàng" link tới plan-return-exchange.md.
- [ ] `docs/13-workflows-and-state-machines.md` thêm RETURN lifecycle state diagram (DRAFT → PAID; không có cancel v1).
- [ ] OpenAPI snapshot mới checked in, `packages/api-client/src/generated/schema.ts` regenerate.
- [ ] `CLAUDE.md` không cần đổi (chưa reference schema cụ thể).

## Definition of Done

- [ ] Toàn bộ e2e + unit pass trên CI.
- [ ] Migration đã chạy thành công trên staging với data thực (TKT-068 DoD).
- [ ] Smoke test trên staging: tạo SALE → return nhanh, regular, exchange (3 flow) → đầy đủ side effect.
- [ ] Sign-off từ PO / team lead.
- [ ] 6 open question trong plan-return-exchange.md đã có answer commit vào doc.

## Tech Approach

### E2E test outline

```ts
describe('POS Return/Exchange E2E', () => {
  let token: string, branchId: string, customerId: string, sessionId: string;
  let saleInvoiceId: string, saleItemId: string;

  beforeAll(async () => {
    // bootstrap org, login admin, seed customer, open POS session
  });

  beforeEach(async () => {
    // create fresh SALE invoice: 5 units of item X @ 100k → checkout PAID with CASH
  });

  describe('Flow 1 - Quick return CASH', () => {
    it('returns items not tied to original invoice, refunds cash', async () => {
      const draft = await request(app).post('/invoices/returns')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Branch-Id', branchId)
        .send({
          mode: 'quick', sessionId, reason: 'KH đổi ý',
          lines: [{ itemId: itemX, locationId, quantity: '1', unitPrice: '100000' }],
        });
      expect(draft.status).toBe(201);
      const checkout = await request(app).post(`/invoices/${draft.body.id}/checkout-return`)
        .send({ refundMethod: 'CASH', cashAccountId: cashAcctId, revenueAccountId: revAcctId });
      expect(checkout.status).toBe(200);
      await waitForConsumers();
      const cash = await db.cash_movements.findOne({ where: { reference: checkout.body.code } });
      expect(cash.type).toBe('WITHDRAWAL');
      expect(cash.amount).toBe('100000.00');
    });
  });

  describe('Flow 2 - Regular partial STORE_CREDIT', () => {
    it('returns 2/5, issues customer credit', async () => {
      const eligible = await request(app).get(`/invoices/${saleInvoiceId}/eligible-returns`);
      expect(eligible.body[0].maxReturnable).toBe('5');
      const draft = await request(app).post('/invoices/returns').send({
        mode: 'regular', originalInvoiceId: saleInvoiceId, customerId, sessionId, reason: 'lỗi sx',
        lines: [{ originalInvoiceItemId: saleItemId, itemId: itemX, locationId, quantity: '2', unitPrice: '100000' }],
      });
      await request(app).post(`/invoices/${draft.body.id}/checkout-return`)
        .send({ refundMethod: 'STORE_CREDIT', creditLiabilityAccountId, revenueAccountId: revAcctId });
      await waitForConsumers();
      const sale = await db.invoice_items.findOne({ where: { id: saleItemId } });
      expect(sale.returned_quantity).toBe('2.00');
      const credit = await db.customer_credits.findOne({ where: { sourceInvoiceId: draft.body.id } });
      expect(credit.remainingAmount).toBe('200000.00');
    });
  });

  describe('Flow 3 - Exchange net < 0', () => { /* trả 500k mua 300k, refund CASH 200k */ });
  describe('Flow 4 - Exchange net > 0', () => { /* trả 300k mua 500k, payments 200k */ });

  describe('Edge cases', () => {
    it('rejects over-return', async () => { /* qty=10 vs sold=5 → 400 */ });
    it('detects concurrent partial returns', async () => { /* race → second 409 */ });
    it('floors loyalty to 0 when insufficient', async () => { /* ... */ });
  });

  describe('Regression', () => {
    it('SALE checkout still works after shared helper extract', async () => { /* ... */ });
    it('rejects cancel of RETURN invoice', async () => { /* ... */ });
  });
});
```

### Manual verification script outline

```bash
#!/bin/bash
# scripts/verify-return-exchange.sh
# Prereq: docker compose up -d, pnpm seed:dev-admin, make dev-api running
set -e
TOKEN=$(curl -s ... /auth/login | jq -r .accessToken)
SESSION=$(curl ... /pos/sessions/open ...)

# 1. SALE invoice
INV=$(curl ... POST /invoices ...)
curl ... POST /invoices/$INV/checkout '{"payments":[{"method":"CASH","amount":500000}]}'

# 2. Quick return CASH
RT=$(curl ... POST /invoices/returns mode=quick ...)
curl ... POST /invoices/$RT/checkout-return '{"refundMethod":"CASH","cashAccountId":"..."}'

# 3. Assert
psql -c "SELECT type, amount FROM cash_movements WHERE reference = '$(curl ... GET /invoices/$RT | jq -r .code)'"

# ... similar for flow 2, 3, 4
```

## Dependencies

- Phụ thuộc: [TKT-073](./TKT-073-checkout-return-service-and-api.md) (service + API ready), [TKT-070](./TKT-070-return-publishers-and-consumers.md) (consumers ready).
- Blocks: EPIC-011 close.
