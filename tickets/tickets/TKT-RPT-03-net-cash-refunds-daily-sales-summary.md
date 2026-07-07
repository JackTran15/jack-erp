# TKT-RPT-03 Net cash refunds in daily-sales-summary

## Epic

[EPIC-05072026 Inventory & report corrections](../epics/EPIC-05072026-inventory-report-corrections.md)

## Summary

On `daily-sales-summary` (`Tổng hợp bán hàng theo ngày`), the goods figure now nets
returns/exchanges (TKT-RPT-02), but the **cash figures still don't** — an exchange/return
where the customer is refunded cash keeps showing the gross amount collected. Repro from the
field: SALE 1.500.000 (cash) + EXCHANGE returning that item for a 750.000 one shows
`Tiền hàng = 750.000` (correct) but `Tiền mặt = 1.500.000` and `Thực thu = 1.500.000` (should
both be **750.000**).

Root cause: the report derives cash from `invoice_payments` rows signed by invoice `type`
(`invoiceTypeSign`: RETURN `−1`, else `+1`). But a **cash refund is never written to
`invoice_payments`** — `CheckoutReturnService` only writes payment rows when `netAmount > 0`
(customer pays more); a refund (`netAmount ≤ 0`) is captured on the invoice as
`refundedAmount` + `refundMethod` and published to `cash_movements` via `CashRefundPublisher`.
So there is no row for the `−1` sign to flip, and EXCHANGE is `+1` anyway — the refund is
invisible to the report. This is the payment-side gap TKT-RPT-02's AC assumed ("refund reduces
payments") but could not deliver against `invoice_payments` alone.

Fix: source cash refunds from the invoice header (`refundMethod === CASH && refundedAmount > 0`)
and subtract them from the cash-based figures, uniformly for RETURN and EXCHANGE.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/reports/daily-sales-summary.report.ts`
  - Resolve the org's **cash** payment account's COA `accountId` once (from the already-fetched
    active `PaymentAccountEntity[]`, `paymentMethod === CASH`).
  - For every `invoiceRow` with `refundMethod === RefundMethod.CASH && Number(refundedAmount) > 0`,
    append a synthetic **negative** cash `PaymentAggInput`
    (`{ invoiceId, paymentMethod: 'cash', amount: -refundedAmount, accountId: cashAccountId }`),
    gated by the existing `needsPayments` check. One input nets **both** cash columns:
    `revenue.cash` (`agg.cash`, method-keyed) and the dynamic `payment.method.<coaAccountId>`
    (`agg.byAccount[accountId]`).
  - Subtract the cash refund from each refund invoice's `totalPaid` contribution in
    `invoiceInputs` so `Thực thu` (`actualRevenue` = `Σ totalPaid`) nets too.
- `apps/api/src/modules/reporting/invoice-report/reports/daily-sales-summary.report.spec.ts`
  - Add cases: exchange-with-cash-refund, pure-return-with-cash-refund, and a
    store-credit/offset refund that must **not** touch cash.

No new columns, no aggregator signature change, no schema/DTO/endpoint change.

## Acceptance Criteria

- [x] SALE 1.500.000 (cash) + EXCHANGE (return 1.500.000, new 750.000, `refundMethod=CASH`,
  `refundedAmount=750.000`) on the same day reports `Tiền hàng = 750.000`, `revenue.cash = 750.000`,
  dynamic cash-account column `= 750.000`, and `Thực thu = 750.000`.
- [x] A pure RETURN with a cash refund subtracts the refund from both cash columns and `Thực thu`.
- [x] A refund with `refundMethod` of `STORE_CREDIT` or `OFFSET` leaves the cash columns and
  `Thực thu` unchanged (no cash left the till).
- [x] Refund nets on the **refund invoice's** `issuedAt` day (not the original sale's day).
- [x] Org/branch scoping, CANCELLED exclusion, and all non-cash columns unchanged.

## Definition of Done

- [x] `pnpm --filter @erp/api test -- daily-sales-summary` green with the new spec cases.
- [x] `pnpm --filter @erp/api lint` clean.
- [x] No `openapi:generate` (response shape/columns unchanged).
- [x] Aggregation stays in JS (synthetic inputs summed by the existing aggregator); no raw SQL.
- [x] No Vietnamese in backend source.

## Tech Approach

```ts
// buildData(): fetch active accounts once, derive the cash COA account id.
const accounts = await this.activeAccounts(actor);
const activeAccountIds = new Set(accounts.map((a) => a.accountId));
const cashAccountId = accounts.find((a) => a.paymentMethod === PaymentMethod.CASH)?.accountId;

// invoiceInputs: net cash refunds out of totalPaid so `Thực thu` matches the cash column.
const cashRefund =
  i.refundMethod === RefundMethod.CASH ? Number(i.refundedAmount ?? 0) : 0;
// ...
totalPaid: sign * Number(i.totalPaid ?? 0) - cashRefund,

// after paymentInputs: append a negative cash payment per cash-refund invoice.
const refundInputs: PaymentAggInput[] =
  needsPayments && cashAccountId
    ? invoiceRows
        .filter(
          (i) =>
            i.issuedAt &&
            i.refundMethod === RefundMethod.CASH &&
            Number(i.refundedAmount ?? 0) > 0,
        )
        .map((i) => ({
          invoiceId: i.id,
          paymentMethod: 'cash',
          amount: -Number(i.refundedAmount),
          accountId: cashAccountId,
        }))
    : [];

const buckets = aggregateByDay(
  invoiceInputs,
  [...paymentInputs, ...refundInputs],
  promotionInputs,
);
```

Notes:
- `PaymentMethod` is the payment-account enum (`payment_account_method_enum`: `cash` / `bank_transfer` / `card`); `RefundMethod` is `pos/entities/invoice.entity.ts` (`CASH` / `STORE_CREDIT` / `OFFSET`).
- If no active cash payment account exists, `revenue.cash` still nets via the method key; only the per-account split is skipped (guarded by `cashAccountId`).
- Assumes one cash COA per org (MISA-style single cash fund). Multiple distinct cash COA accounts would attribute the whole refund to the first; acceptable and flagged here.

## Testing Strategy

- Unit (`daily-sales-summary.report.spec.ts`): mock repos to return the SALE+EXCHANGE fixture and
  assert the four cell values; add the store-credit no-op and the different-day bucketing cases.

## Dependencies

- Depends on: TKT-RPT-02 (header-grain signing already in place; this closes its cash gap).
- Independent of the GIP/EXL streams and TKT-RPT-01.
