# TKT-RPT-01 Net returns in line-grain reports

## Epic

[EPIC-05072026 Inventory & report corrections](../epics/EPIC-05072026-inventory-report-corrections.md)

## Summary

`revenue-by-item` and `invoice-item-revenue-detail` sum every invoice line positively, so a
returned/exchanged line inflates quantity and revenue instead of reducing them. Thread the line
`direction` (`OUT`/`IN`) into the row inputs and negate `quantity`/`lineTotal` when `direction === IN`
before aggregating. In-memory only (repo convention — no SQL GROUP BY).

## Deliverables

- `reports/revenue-by-item.report.ts` (row map ~L144-162) — carry `direction: li.direction` into
  `RevenueByItemRowInput`.
- `revenue-by-item.aggregator.ts` — add `direction` to the input type; in `aggregateByItem`
  accumulate `sign * quantity` and `sign * lineTotal` (sign = `direction === IN ? -1 : 1`).
- `reports/invoice-item-revenue-detail.report.ts` — carry `direction` into `InvoiceItemRowInput`.
- `invoice-item-revenue.aggregator.ts` — same signed accumulation in `buildItemTotals`.
- Update `revenue-by-item.aggregator.spec.ts` and `invoice-item-revenue.aggregator.spec.ts`.

## Acceptance Criteria

- [x] A SALE line qty 3 / total 300k and a RETURN line qty 1 / total 100k for the same item net
  to qty 2 / 200k.
- [x] An EXCHANGE (OUT new + IN returned lines) nets automatically via `direction`.
- [x] CANCELLED invoices remain excluded (unchanged `applyInvoiceStatusFilter`).
- [x] All queries stay scoped by `actor.organizationId` (+ branch scope); joins stay inline.

## Definition of Done

- [x] `pnpm --filter @erp/api test` + `lint` green with updated aggregator specs.
- [x] No `openapi:generate` (report columns unchanged; only values corrected).
- [x] No SQL GROUP BY introduced; aggregation stays in JS.

## Tech Approach

```ts
const sign = row.direction === ItemDirection.IN ? -1 : 1;
agg.quantity += sign * row.quantity;
agg.total    += sign * row.lineTotal;
```

## Testing Strategy

- Unit (aggregator specs): assert signed accumulation for OUT-only, IN-only, and mixed sets.

## Dependencies

- Independent of the GIP/EXL streams and of TKT-RPT-02.
