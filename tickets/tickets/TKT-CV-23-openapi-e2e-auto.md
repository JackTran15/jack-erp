# TKT-CV-23 OpenAPI regen + E2E (auto flow)

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only — gate cuối Phase 2.

## Summary

Regenerate API client + automated E2E cho 4 auto-create flow qua Kafka thật (testcontainers Redpanda), gồm idempotency, insufficient-balance rollback, re-issue sau REVERSED, outbox crash-recovery.

## Deliverables

- `pnpm openapi:generate` → commit `openapi.snapshot.json` + generated client.
- `apps/api/test/e2e/cash-vouchers-phase2.e2e-spec.ts`:
  - POS cash sale → PT auto (purpose=POS_SALE, 1 movement, JE cân bằng).
  - Debt CASH collect → PT auto + `cash_receipt_id` link; 1 JE share.
  - GR CASH post → PC auto + `cash_payment_id` link; 1 JE share.
  - Expense CASH post → PC auto + `cash_payment_id` link; 1 JE share.
  - Replay event → no duplicate (idempotency + unique constraint).
  - Insufficient balance GR/Expense → 400 + rollback (không movement/JE/outbox row).
  - Re-issue sau REVERSED → không bị unique chặn.
  - Outbox crash-recovery: relay tắt → source POST 200 → bật relay → voucher xuất hiện ≤ Ns, ledger hết `(Chưa có chứng từ)`.

## Acceptance Criteria

- [ ] **(partial)** Mọi Phase 2 AC có assertion E2E. ✅ Expense auto-create flow đầy đủ (`cash-vouchers-phase2.e2e-spec.ts`). ⛔ GR / debt / POS auto-create flow + reverse/re-issue chưa có spec riêng (đã unit-test ở source service + consumer).
- [x] Assert **1 JE per transaction** (`expense.journal_entry_id = cash_payments.journal_entry_id`) cho expense flow.
- [x] Outbox crash-recovery test xanh (relay tắt → `pollOnce` → voucher; không thao tác DB thủ công).
- [x] `openapi.snapshot.json` + generated client regenerated (`pnpm openapi:generate` từ live `:4000`).

## Definition of Done

- [ ] **(partial)** E2E qua Redpanda thật pass cục bộ (real Redpanda, không testcontainers); teardown sạch (race `app.close()` + `forceExit`). Combined run 2 suite trong 1 process còn flaky do Kafka group rebalance — mỗi suite pass độc lập (P1 11/11, P2 2/2).
- [x] Migration rollback test: `pnpm migration:revert` trên TKT-CV-13 → schema về Phase 1 sạch (verified up/down).
- [x] Docs: `docs/architecture-cash-flow.md` (section voucher layer + auto-create + Transactional Outbox) + `tickets/README.md`.

## Tech Approach

- Dùng testcontainers Redpanda; bật/tắt relay qua DI để mô phỏng crash path.
- Đợi eventual consistency với polling + timeout (≤ 2s happy path).

## Dependencies

- Phụ thuộc: TKT-CV-16, TKT-CV-18, TKT-CV-22, TKT-CV-OB3.
- Blocks: Phase 2 close-out.
