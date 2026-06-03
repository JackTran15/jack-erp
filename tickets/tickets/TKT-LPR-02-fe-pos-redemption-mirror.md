# TKT-LPR-02 FE: pos-web redemption-rate mirror + display copy

## Epic

[EPIC-03062026 Loyalty point rate change](../epics/EPIC-03062026-loyalty-point-rate-change.md)

## Summary

The pos-web checkout UI mirrors the backend redemption value to show "số tiền giảm từ điểm" before the cashier checks out. Update that mirror constant from `1000` to `500` so the previewed discount matches what the BE will compute. BE remains source of truth at `POST /invoices/:id/redeem-points`; this is display-only alignment so the cashier never sees a number that the server then overrides.

## Deliverables

- `apps/pos-web/src/constants/loyalty.constant.ts` — `POINT_REDEMPTION_VALUE_VND = 500`; update the doc comment ("1 điểm = 500đ khi đổi").
- No change needed at the consumers (`stores/common/checkout-session.store.ts`, `PromoMenu`) — they read the constant.
- Verify the POS earn-side: pos-web does **not** compute earned points (earning is BE-only via the Kafka consumer), so there is no FE earn constant to change. Confirm by grep that no `10000`/earn rate is hard-coded in pos-web.

## Acceptance Criteria

- [ ] On a draft with a carded customer, entering 100 points to redeem previews a `−50.000đ` discount in the payment summary, matching the server response on checkout (no flicker/correction after the API call).
- [ ] No other pos-web file hard-codes the old `1000` redemption rate (`grep -rn "1000" apps/pos-web/src` for loyalty usages reviewed; only the mirror constant carries the literal).
- [ ] No earn-rate constant exists or is introduced on the FE.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (typecheck) passes.
- [ ] Visual check: redeem-points flow in CheckoutPage shows the new discount; screenshot before/after in the PR.
- [ ] FE user-facing strings stay Vietnamese; the constant's comment updated to 500đ.
- [ ] No TODO/FIXME.

## Tech Approach

```ts
// apps/pos-web/src/constants/loyalty.constant.ts
/**
 * Hằng số loyalty mirror từ BE (`apps/api/src/modules/customer/loyalty.constants.ts`).
 * 1 điểm = 500đ khi đổi. FE dùng để hiển thị "số tiền giảm từ điểm" — BE vẫn
 * là nguồn sự thật khi POST /invoices/:id/redeem-points (tính lại `pointsDiscountAmount`).
 */
export const POINT_REDEMPTION_VALUE_VND = 500;
```

`checkout-session.store.ts` computes `pointsDiscountAmount = effectivePointsRedeemed * POINT_REDEMPTION_VALUE_VND` and `PromoMenu` passes `pointsRate` to the member-card display — both pick up the new value automatically.

## Testing Strategy

- Manual: run `make dev-pos`, open CheckoutPage, attach a carded customer, redeem points, confirm the previewed discount = `points × 500` and survives checkout unchanged.

## Dependencies

- Depends on: [TKT-LPR-01](./TKT-LPR-01-be-rate-constants-and-reversal-fix.md) (BE rate must match the mirror).
- Blocks: [TKT-LPR-03](./TKT-LPR-03-e2e-loyalty-rate-regression.md).
