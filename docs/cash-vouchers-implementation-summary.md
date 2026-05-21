# Cash Vouchers — Implementation Summary (EPIC-18052026)

> Backend-only. Document layer on top of `cash_accounts` / `cash_movements`:
> **Phiếu thu** (cash receipts), **Phiếu chi** (cash payments), **Sổ tiền mặt** (cash
> detail ledger), **Kiểm kê tiền mặt** (cash counts), category lookups — plus Phase 2
> auto-creation of vouchers from POS / debt / goods-receipt / expense via Kafka and a
> transactional outbox.

- Epic spec: [tickets/epics/EPIC-18052026-cash-vouchers.md](../tickets/epics/EPIC-18052026-cash-vouchers.md)
- Architecture: [docs/architecture-cash-flow.md](./architecture-cash-flow.md) (sections 6–7)
- Code: `apps/api/src/modules/accounting/cash-vouchers/` + `apps/api/src/modules/events/outbox/`

---

## 1. Status

| Area                                            | Status                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 (manual flow + ledger + count)          | ✅ Done — E2E `cash-vouchers-phase1.e2e-spec.ts` 11/11                                                                              |
| Phase 2 infra (outbox, topics, schema)          | ✅ Done — migrations up/down validated, outbox unit-tested                                                                          |
| Phase 2 auto-create (POS / debt / GR / expense) | ✅ Implemented + unit-tested; expense flow E2E `cash-vouchers-phase2.e2e-spec.ts` 2/2                                               |
| OpenAPI client                                  | ✅ Regenerated (`packages/api-client/openapi.snapshot.json` + `schema.ts`)                                                          |
| CV-OB3 (wire all publishes via outbox)          | ⚠️ Partial — 3 source `needed.*` events via outbox; POS `needed.pos_sale` + `cash.voucher.created` still direct publish (follow-up) |
| CV-23 (4-flow Kafka E2E + crash-recovery)       | ⚠️ Partial — only the expense flow has a dedicated E2E                                                                              |
| Frontend                                        | ❌ Deferred to a separate FE epic                                                                                                   |

Migrations: `1781000000000-CashVouchersPhase1`, `1781100000000-OutboxMessages`, `1781200000000-CashVouchersPhase2Schema`.

---

## 2. APIs — 25 new endpoints (+3 existing extended)

Headers on every call: `Authorization: Bearer <token>`, `X-Branch-Id: <branchId>`; mutations also accept `X-Idempotency-Key`.

| Group                           | #   | Routes                                                                                                                                                                                            |
| ------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cash receipts                   | 7   | `POST /cash-receipts`, `GET /cash-receipts`, `GET /cash-receipts/:id`, `PATCH /cash-receipts/:id`, `DELETE /cash-receipts/:id`, `POST /cash-receipts/:id/post`, `POST /cash-receipts/:id/reverse` |
| Cash payments                   | 7   | mirror under `/cash-payments`                                                                                                                                                                     |
| Cash ledger                     | 1   | `GET /cash-ledger`                                                                                                                                                                                |
| Cash counts                     | 5   | `POST /cash-counts`, `GET /cash-counts`, `GET /cash-counts/:id`, `PATCH /cash-counts/:id`, `POST /cash-counts/:id/post`                                                                           |
| Categories (auto generic-CRUD)  | 5   | `/admin/entities/cash-voucher-categories/records` (list/create/get/update/delete)                                                                                                                 |
| **Phase 2 — extended existing** | 3   | `POST /expenses` + `/expenses/:id/post`, `POST /goods-receipts` + `/goods-receipts/:id/post`, `POST /invoices/debts/:debtId/payments` (added `paymentMethod`/`cashAccountId`)                     |

---

## 3. CURL examples

```bash
BASE=http://localhost:4000
AUTH="Authorization: Bearer $TOKEN"
BR="X-Branch-Id: $BRANCH_ID"

# ── Phiếu thu ──────────────────────────────────────────────────────────────
# Create DRAFT (header + lines; totalAmount must equal sum(lines.amount))
curl -X POST $BASE/cash-receipts -H "$AUTH" -H "$BR" -H 'Content-Type: application/json' -d '{
  "voucherDate":"2026-05-21","cashAccountId":"<CASH_ACC>","contraAccountId":"<ACC_511>",
  "purpose":"OTHER_INCOME","payerName":"Nguyen Van A","reason":"Thu bán hàng",
  "totalAmount":1000000,
  "lines":[{"description":"Thu tiền mặt","amount":1000000,"categoryId":"<CAT_THU_BAN_HANG>"}]
}'

# Post (DRAFT → POSTED): DEPOSIT movement + balanced JE + balance += total
curl -X POST $BASE/cash-receipts/<ID>/post -H "$AUTH" -H "$BR"

# Reverse (POSTED → REVERSED + reversal voucher; balance restored)
curl -X POST $BASE/cash-receipts/<ID>/reverse -H "$AUTH" -H "$BR" \
  -H 'Content-Type: application/json' -d '{"reason":"Khách trả lại"}'

# List (filters: status, purpose, cashAccountId, dateFrom/To, partnerId, search, source)
curl "$BASE/cash-receipts?status=POSTED&dateFrom=2026-05-01&dateTo=2026-05-31&source=POS_SALE&page=1&pageSize=20" -H "$AUTH" -H "$BR"

# Detail (lines + sourceLink {sourceType, sourceId, sourceDocumentNumber})
curl $BASE/cash-receipts/<ID> -H "$AUTH" -H "$BR"

# ── Phiếu chi (mirror; post = WITHDRAWAL, insufficient balance → 400) ────────
curl -X POST $BASE/cash-payments -H "$AUTH" -H "$BR" -H 'Content-Type: application/json' -d '{
  "voucherDate":"2026-05-21","cashAccountId":"<CASH_ACC>","contraAccountId":"<ACC_642>",
  "purpose":"EXPENSE","payeeName":"Cty B","totalAmount":500000,
  "lines":[{"description":"Chi VPP","amount":500000}]}'
curl -X POST $BASE/cash-payments/<ID>/post -H "$AUTH" -H "$BR"

# ── Sổ chi tiết tiền mặt (cursor pagination) ────────────────────────────────
curl "$BASE/cash-ledger?cashAccountId=<CASH_ACC>&dateFrom=2026-05-01&dateTo=2026-05-31&limit=100" -H "$AUTH" -H "$BR"
# → { openingBalance, pageOpeningBalance, rows[], pageClosingBalance, nextCursor, closingBalance, totalDebit, totalCredit }
# next page: &cursor=<nextCursor>

# ── Kiểm kê tiền mặt ────────────────────────────────────────────────────────
curl -X POST $BASE/cash-counts -H "$AUTH" -H "$BR" -H 'Content-Type: application/json' -d '{
  "cashAccountId":"<CASH_ACC>","countedAt":"2026-05-21T17:00:00Z","actualAmount":1200000,
  "denominations":[{"denom":500000,"count":2},{"denom":200000,"count":1}]}'
# Post: snapshots expected = balance, computes variance; >0 → Phiếu thu(711), <0 → Phiếu chi(811)
curl -X POST $BASE/cash-counts/<ID>/post -H "$AUTH" -H "$BR"

# ── Categories (auto CRUD) ──────────────────────────────────────────────────
curl "$BASE/admin/entities/cash-voucher-categories/records?page=1&pageSize=50" -H "$AUTH" -H "$BR"

# ── Phase 2 auto-create (extended existing endpoints) ───────────────────────
curl -X POST $BASE/expenses/<ID>/post -H "$AUTH" -H "$BR"        # expense w/ paymentMethod=CASH,cashAccountId
curl -X POST $BASE/goods-receipts/<ID>/post -H "$AUTH" -H "$BR"  # GR w/ paymentMethod=CASH,cashAccountId
curl -X POST $BASE/invoices/debts/<DEBT_ID>/payments -H "$AUTH" -H "$BR" \
  -H 'Content-Type: application/json' \
  -d '{"amount":100000,"paymentMethod":"cash","staffId":"<UID>","cashAccountId":"<CASH_ACC>"}'
```

---

## 4. Automations — 5 auto-create flows + 8 background components

| #   | Flow                                       | Trigger                                             | Result                                                                         |
| --- | ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Cash-count variance (Phase 1, synchronous) | `POST /cash-counts/:id/post`                        | variance > 0 → Phiếu thu (TK 711); < 0 → Phiếu chi (TK 811); = 0 → no voucher  |
| 2   | POS cash sale → Phiếu thu                  | checkout publishes `erp.cash.movement.from.payment` | `PosCashSaleConsumer.createAndPostInternal()` (movement + JE + voucher atomic) |
| 3   | Debt collection (CASH) → Phiếu thu         | `collectPayment` enqueues `needed.debt_payment`     | `DebtCollectionCashConsumer.createVoucherForMovement()`                        |
| 4   | Goods receipt (CASH) → Phiếu chi           | `post()` enqueues `needed.goods_receipt`            | `GoodsReceiptCashConsumer`                                                     |
| 5   | Expense (CASH) → Phiếu chi                 | `post()` enqueues `needed.expense`                  | `ExpenseCashConsumer`                                                          |

**Background components (8):** 4 voucher consumers (above) + 3 link-back consumers
(`DebtPaymentVoucherLinkConsumer`, `GoodsReceiptVoucherLinkConsumer`,
`ExpenseVoucherLinkConsumer` — back-fill `cash_receipt_id`/`cash_payment_id` on the
source) + 1 `OutboxRelayService` poller.

**Invariant (Transactional Outbox):** source committed ⟺ outbox row exists ⟺ event
published ⟺ voucher created. The relay publishes pending rows at-least-once
(`FOR UPDATE SKIP LOCKED` + exponential backoff); deterministic `event_id`
(`uuidv5(sourceType, sourceId)`) + `processed_events` + the unique
`(org, reference_type, reference_id)` index make replay idempotent.

---

## 5. Frontend implementation (separate FE epic)

| Page                               | Endpoints                                                    |
| ---------------------------------- | ------------------------------------------------------------ |
| `/admin/cash-receipts` (Phiếu thu) | `cash-receipts` CRUD + post + reverse                        |
| `/admin/cash-payments` (Phiếu chi) | `cash-payments` CRUD + post + reverse                        |
| `/admin/cash-ledger` (Sổ tiền mặt) | `GET /cash-ledger` (cursor)                                  |
| `/admin/cash-counts` (Kiểm kê)     | `cash-counts` CRUD + post                                    |
| `/admin/cash-voucher-categories`   | auto-renders via `CrudListPage` (generic platform — no code) |

Conventions:
- Consume via `erpApi` + `requireErpData`/`requireErpSuccess`, wrapped in TanStack Query.
- Query keys: `["cash-receipts", filters]`, `["cash-payments", …]`,
  `["cash-ledger", cashAccountId, dateFrom, dateTo, cursor]`, `["cash-counts", …]`,
  `["cash-accounts"]`. Invalidate by prefix after post/reverse.
- All UI strings Vietnamese; format money/date with `Intl` `vi-VN`; enum values stay English.
- Forms: `DocumentFormDialog` + `LineItemGrid` (clone `PurchaseOrdersPage`). Cash count
  form shows live `currentBalance` (from the create/detail response) and computes variance.
- Phase 2 form deltas: `paymentMethod` + két (`cashAccountId`) selector on goods-receipt /
  expense forms and the debt-collection modal (két visible when CASH); "Tự động" badge when
  `referenceType ≠ MANUAL`; "Chứng từ nguồn" section from detail `sourceLink`.
- Nav: add `catalog-receipts-expenses` group in `navConfig.ts` + `<Route>`s in `App.tsx`.

---

## 6. Per-API → database tables to verify

| Endpoint                                       | Tables to check                                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST/PATCH /cash-receipts`                    | `cash_receipts`, `cash_receipt_lines`                                                                                                                                                   |
| `POST /cash-receipts/:id/post`                 | `cash_receipts` (status, document_number, cash_movement_id, journal_entry_id), `cash_movements` (DEPOSIT), `journal_entries` + `journal_lines`, `cash_accounts` (balance ↑)             |
| `POST /cash-receipts/:id/reverse`              | `cash_receipts` (original `REVERSED` + `reversed_by_voucher_id`; reversal row `reference_type=REVERSAL`), `cash_movements` (WITHDRAWAL), `journal_entries`, `cash_accounts` (balance ↓) |
| `POST /cash-payments/:id/post`                 | same as receipt post, but WITHDRAWAL / balance ↓ (DR contra / CR cash)                                                                                                                  |
| `POST /cash-payments/:id/reverse`              | mirror of receipt reverse, but DEPOSIT / balance ↑                                                                                                                                      |
| `GET /cash-ledger`                             | reads `cash_movements` (+ `cash_receipts` / `cash_payments` for inline voucher)                                                                                                         |
| `POST /cash-counts/:id/post`                   | `cash_counts` (expected_amount, variance, variance_voucher_*), `cash_movements`, `journal_entries`, `cash_accounts`, + `cash_receipts` / `cash_payments` (variance voucher)             |
| Categories CRUD                                | `cash_voucher_categories`                                                                                                                                                               |
| `POST /expenses/:id/post` (CASH)               | `expenses` (journal_entry_id, later cash_payment_id), `cash_movements`, `journal_entries`, `cash_accounts`, `outbox_messages` → async `cash_payments`                                   |
| `POST /goods-receipts/:id/post` (CASH)         | `goods_receipts` (journal_entry_id, later cash_payment_id), `cash_movements`, `journal_entries`, `cash_accounts`, `outbox_messages` → async `cash_payments`                             |
| `POST /invoices/debts/:debtId/payments` (CASH) | `debt_payments` (journal_entry_id, later cash_receipt_id), `invoice_debts` (remaining), `cash_movements`, `journal_entries`, `cash_accounts`, `outbox_messages` → async `cash_receipts` |
| Auto-flow health (any)                         | `outbox_messages` (`published_at IS NULL` = pending), `processed_events` (consumer dedupe), `dead_letter_events` (failed consumers)                                                     |

For the async flows, the source `journal_entry_id` = `cash_payments/receipts.journal_entry_id`
= `cash_movements.journal_entry_id` (one JE per transaction); the `outbox_messages` row flips
to `published_at NOT NULL` once the relay runs.

---

## 7. Verify locally

```bash
# unit tests
pnpm --filter @erp/api test

# E2E (pre-create erp_test once: docker exec erp-postgres createdb -U erp_user erp_test)
DB_HOST=localhost DB_PORT=5433 DB_USER=erp_user DB_PASS=erp_secret DB_NAME=erp_test \
REDIS_HOST=localhost REDIS_PORT=6380 KAFKA_BROKERS=localhost:19092 OUTBOX_RELAY_DISABLED=1 \
pnpm --filter @erp/api test:e2e -- cash-vouchers-phase1   # 11/11
# (run phase2 separately — running both suites in one process is flaky on Kafka group rebalance)
pnpm --filter @erp/api test:e2e -- cash-vouchers-phase2   # 2/2

# migrations
cd apps/api && pnpm migration:run && pnpm migration:revert
```
