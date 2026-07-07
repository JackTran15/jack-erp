# TKT-RPT-02 Net returns in header-grain reports

## Epic

[EPIC-05072026 Inventory & report corrections](../epics/EPIC-05072026-inventory-report-corrections.md)

## Summary

`daily-sales-summary` and `invoice-order-listing` sum stored invoice header fields positively, so
RETURN/EXCHANGE invoices inflate the totals. Sign each invoice's contribution so returns subtract.
Follow the canonical line-direction rule: derive the **goods** figure from signed line sums
(`Σ OUT lineTotal − Σ IN lineTotal`), which nets EXCHANGE automatically; sign the header-only
fields (`discountAmount`, `pointsDiscountAmount`, `totalPaid`, cash/voucher payments) by invoice
`type` — RETURN negates, EXCHANGE uses its net (refund reduces `totalPaid`), SALE positive.

## Deliverables

- `reports/daily-sales-summary.report.ts` — thread `invoice.type` (and, where needed, per-invoice
  signed line sums) into `InvoiceAggInput`.
- `invoice-report.aggregator.ts` — extend `InvoiceAggInput` with `type` (+ goods-from-lines);
  apply the sign in `aggregateByDay` / `combineAggregates` and the payment/promotion loops.
- `reports/invoice-order-listing.report.ts` — thread `type` into `InvoiceRowInput`.
- `invoice-listing.aggregator.ts` — sign the per-row money and the `buildListingTotals` footer.
- Update `invoice-report.aggregator.spec.ts` and `invoice-listing.aggregator.spec.ts`.

## Acceptance Criteria

- [x] A day with SALE 100k + RETURN 50k reports **50k** revenue and a correctly reduced
  `totalPaid`/cash line (not 150k).
- [x] An EXCHANGE contributes its net (new − returned) to revenue and its refund reduces payments.
- [x] Per-invoice listing rows for a RETURN show a negative contribution and the footer nets them.
- [x] CANCELLED still excluded; org/branch scoping unchanged.

## Definition of Done

- [x] `pnpm --filter @erp/api test` + `lint` green with updated aggregator specs (the spec pins
  the exact EXCHANGE field signing).
- [x] No `openapi:generate` (columns unchanged).
- [x] Aggregation stays in JS; joins inline.

## Tech Approach

```ts
// per invoice: goods = Σ(OUT lineTotal) − Σ(IN lineTotal)
const headerSign = inv.type === InvoiceType.RETURN ? -1 : 1; // EXCHANGE handled via net fields/lines
b.sums.subtotal          += goods;
b.sums.discountAmount    += headerSign * inv.discountAmount;
b.sums.pointsDiscountAmount += headerSign * inv.pointsDiscountAmount;
b.sums.totalPaid         += headerSign * inv.totalPaid; // EXCHANGE: net/refund-aware
```

## Testing Strategy

- Unit: assert SALE-only, SALE+RETURN netting, and an EXCHANGE case; lock the EXCHANGE field
  signing convention in the spec.

## Dependencies

- Independent of the GIP/EXL streams and of TKT-RPT-01 (can land in either order).
