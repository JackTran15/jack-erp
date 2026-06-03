# TKT-LPR-01 BE: change earn/redeem rate constants + fix reversal divisor + unit tests

## Epic

[EPIC-03062026 Loyalty point rate change](../epics/EPIC-03062026-loyalty-point-rate-change.md)

## Summary

Re-price the loyalty programme on the backend by changing the two rate constants and fixing the one place that hard-codes the old earn divisor. Earn becomes `floor(subtotal / 10000)` (1.000.000đ → 100 pts); redeem becomes `points × 500` (100 pts → 50.000đ). The return-reversal consumer currently divides `subtotalDelta` by a literal `1000`; it must use `POINT_EARN_VND_PER_POINT` so reversal mirrors earning exactly. No schema, no entity, no event, no endpoint change.

## Deliverables

- `apps/api/src/modules/customer/loyalty.constants.ts` — `POINT_EARN_VND_PER_POINT = 10000`, `POINT_REDEMPTION_VALUE_VND = 500`; update the doc comments to the new amounts.
- `apps/api/src/modules/customer/consumers/loyalty-points-reverse.consumer.ts` — import `POINT_EARN_VND_PER_POINT` from `../loyalty.constants` and replace the hard-coded `1000` on line 50 (`Math.floor(Math.abs(Number(subtotalDelta)) / 1000)`) with the constant.
- `apps/api/src/modules/customer/services/membership-card.service.spec.ts` (if present) / new spec — assert award math at the new rate.
- `apps/api/src/modules/pos/services/points-redemption.service.spec.ts` (if present) / new spec — assert redemption math at the new rate.
- No change to `membership-card.service.ts:136` (earn) or `points-redemption.service.ts:61` (redeem) logic — they already read the constants.

## Acceptance Criteria

- [ ] `awardPointsForInvoice` credits `floor(subtotal / 10000)` — a 1.000.000đ subtotal → `EARN.delta = 100`; a 9.999đ subtotal → 0 (no card-less / sub-threshold crediting).
- [ ] `applyRedemption` sets `pointsDiscountAmount = points × 500` and recomputes `amountDue`; the existing "discount exceeds redeemable amount" guard still fires correctly at the new rate.
- [ ] `LoyaltyPointsReverseConsumer` reverses `floor(|subtotalDelta| / 10000)` points — a 1.000.000đ return reverses **100**, not 1000; the `Math.min(requested, card.points)` cap and the zero-delta NO-OP history branch are unchanged.
- [ ] No hard-coded loyalty `1000` remains anywhere except the literal constant values: `grep -rn "/ 1000\|\* 1000\|1000)" apps/api/src/modules/customer apps/api/src/modules/pos` reviewed; only `loyalty.constants.ts` holds rate literals.
- [ ] All queries/consumers still filter by `actor.organizationId` / `organizationId`; idempotency (redemption interceptor + reverse-consumer `historyRepo.findOne({ invoiceId })` dedupe) unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` green incl. updated/added award + redemption + reversal specs.
- [ ] `pnpm --filter @erp/api lint` clean.
- [ ] No schema change; `synchronize` stays false; no migration added.
- [ ] No `openapi:generate` needed (no endpoint signature change) — note in PR why it's skipped.
- [ ] No Vietnamese in backend source (the existing `note` strings on `PointHistoryEntity` inserts are pre-existing data values, not changed by this ticket).
- [ ] No TODO/FIXME.

## Tech Approach

```ts
// apps/api/src/modules/customer/loyalty.constants.ts
/** VND of invoice subtotal that earns 1 point (10.000đ spent → 1 point; 10% of value ÷ 1.000). */
export const POINT_EARN_VND_PER_POINT = 10000;

/** VND discount granted per point redeemed (1 point → 500đ off). */
export const POINT_REDEMPTION_VALUE_VND = 500;
```

```ts
// apps/api/src/modules/customer/consumers/loyalty-points-reverse.consumer.ts
import { POINT_EARN_VND_PER_POINT } from '../loyalty.constants';
// ...
const requestedDelta = Math.floor(
  Math.abs(Number(subtotalDelta)) / POINT_EARN_VND_PER_POINT,
);
```

Earn (`membership-card.service.ts:136`) and redeem (`points-redemption.service.ts:61`) are unchanged — they already divide/multiply by the constants. The only logic edit is swapping the reversal magic number for the constant so earn and reverse stay symmetric by construction (not by two independently-maintained `1000`s).

## Testing Strategy

- Unit (`membership-card.service.spec.ts`): seed an active card, call `awardPointsForInvoice({ subtotal: 1_000_000 })`, assert balance `+100` and an `EARN` history row with `delta = 100`; edge case `subtotal: 9_999` → no-op.
- Unit (`points-redemption.service.spec.ts`): draft invoice + carded customer, `applyRedemption(id, 100)` → `pointsDiscountAmount = 50_000`; assert the over-redeem guard rejects when `points × 500 > subtotal − discount − deposit`.
- Reversal covered in E2E (TKT-LPR-03) where the Kafka round-trip runs; a focused consumer unit test asserting `floor(|delta| / 10000)` is acceptable in lieu of the full bus.

## Dependencies

- Depends on: none (entry ticket).
- Blocks: [TKT-LPR-02](./TKT-LPR-02-fe-pos-redemption-mirror.md), [TKT-LPR-03](./TKT-LPR-03-e2e-loyalty-rate-regression.md).
