# TKT-LPR-03 E2E: loyalty earn/redeem/reverse regression at new rates

## Epic

[EPIC-03062026 Loyalty point rate change](../epics/EPIC-03062026-loyalty-point-rate-change.md)

## Summary

Update and extend the loyalty e2e coverage so the new rates are asserted end-to-end through the real HTTP + Kafka path: a sale earns at `÷10000`, a redemption discounts at `×500`, and a return reverses at `÷10000`. The existing `apps/api/test/e2e/loyalty.e2e-spec.ts` hard-codes 1000-based expectations and will fail after TKT-LPR-01; fix those assertions and add a reversal-rate case.

## Deliverables

- `apps/api/test/e2e/loyalty.e2e-spec.ts` — update every 1000-based expectation to the new rates; add (or adjust) a case that checks out a 1.000.000đ sale and asserts the carded customer's balance increases by **100**, redeems 100 points for a **50.000đ** discount, and (return flow) reverses exactly **100** points.
- Any other e2e/unit spec that asserts loyalty amounts (search by `POINT_EARN_VND_PER_POINT` / `POINT_REDEMPTION_VALUE_VND` / literal `1000` in `apps/api/test` and `apps/api/src`).

## Acceptance Criteria

- [ ] Earn: a 1.000.000đ checkout for a carded customer yields `point_history.EARN.delta = 100` and the card balance reflects +100 (async award consumer settled).
- [ ] Redeem: applying 100 points sets `pointsDiscountAmount = 50000`, reduces `amountDue` by 50.000đ, and decrements the balance by 100 on checkout.
- [ ] Reverse: returning the sale credits back exactly **100** points (not 1000); the reverse is idempotent on event replay (second delivery is a no-op via the `invoiceId` dedupe).
- [ ] Org scoping holds — a second org's card is never touched.
- [ ] `pnpm --filter @erp/api test` and `pnpm --filter @erp/api test:e2e` both green.

## Definition of Done

- [ ] Full unit + e2e suites pass against `erp_test` (`apps/api/test/e2e` setup auto-creates DB + runs migrations; serial, `forceExit`).
- [ ] Read the actual test output, not just the exit message (kafkajs teardown can masquerade as a suite failure — see CLAUDE.md).
- [ ] No Vietnamese in backend/test source.
- [ ] No TODO/FIXME.

## Tech Approach

- Drive the existing checkout → award-consumer → return → reverse-consumer path already exercised by `loyalty.e2e-spec.ts`; only the expected numbers change (earn 100, redeem 50.000, reverse 100). Where the spec polls for the async award, keep the existing wait/retry helper.
- For the reversal-rate assertion, return the full sale and assert the post-reverse `EARN`/`ADJUST` history nets to the originally-earned 100 (balance back to its pre-sale value, modulo any redeemed-then-refunded points the case sets up).

## Testing Strategy

- E2E (`apps/api/test/e2e/loyalty.e2e-spec.ts`): the canonical 1.000.000đ round-trip above, plus the existing summary/redemption endpoint cases re-baselined to 500đ/point.
- Run single-file first during iteration: `pnpm --filter @erp/api test:e2e -- loyalty`.

## Dependencies

- Depends on: [TKT-LPR-01](./TKT-LPR-01-be-rate-constants-and-reversal-fix.md) (rates), [TKT-LPR-02](./TKT-LPR-02-fe-pos-redemption-mirror.md) (FE mirror — no e2e impact but closes the epic).
- Blocks: none (final gate).
