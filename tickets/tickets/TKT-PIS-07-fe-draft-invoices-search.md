# TKT-PIS-07 FE: Wire "Hóa đơn chưa thanh toán" to server-side search (#4)

## Epic

[EPIC-03062026 POS server-side invoice search](../epics/EPIC-03062026-pos-invoice-search.md)

## Summary

Re-wire `DraftInvoicesDialog` so its free-text box ("Nhập tên, số điện thoại khách hàng, số hóa đơn") and `PosDateRangeFilter` ("Toàn bộ") drive `useDraftInvoicesQuery` server-side via `searchDrafts`, replacing the in-memory `filteredDrafts` logic. The right-hand detail panel keeps using the already-loaded row / existing per-invoice fetch.

> Lower-value than #5/#2 (drafts are few and session-bound), but in scope per the epic. If the dataset is genuinely tiny in practice, the reviewer may keep client-side filtering for #4 — call that out in the PR rather than deciding silently.

## Deliverables

- `apps/pos-web/src/hooks/react-query/use-query-invoice.ts` — `useDraftInvoicesQuery` takes `({ search, dateFilter, sessionId, page, enabled })`, maps the `PosDateRangeFilterOption` to a `DateRangeFilter` (createdAt), and calls `invoiceService.searchDrafts`.
- `apps/pos-web/src/components/page-components/Checkout/CheckoutDialogs/DraftInvoicesDialog/DraftInvoicesDialog.tsx` — lift search + date state (already supported via the `searchValue`/`onSearchChange`/`dateFilter` props), debounce the free-text, drop the `filteredDrafts` `useMemo`; feed server results straight to `InvoiceListPanel`.
- `apps/pos-web/src/components/page-components/Checkout/CheckoutDialogs/DraftInvoicesDialog/FilterBar/FilterBar.tsx` — unchanged structurally; just confirm it reports value changes upward (it already does).

## Acceptance Criteria

- [ ] Free-text query hits the server (debounced) and ORs over invoice code / customer name / customer phone (BE-enforced); blank query returns all drafts in scope.
- [ ] `PosDateRangeFilter` selection maps to `createdAt` `{ from, to }` (compute the range from the preset via the existing `dateRangeFilter` lib) and is sent to the server.
- [ ] Selection state (`selectedId`) stays valid as the server list changes; empty state still "Chưa có hóa đơn lưu tạm".
- [ ] **Session-scoping decision recorded:** either pass `sessionId` (re-enabling session scope, matching the original intent) or omit it (current effective behaviour = all org/branch drafts). State which in the PR; coordinate with the optional `sessionId` from TKT-PIS-03.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` passes; `filteredDrafts`/`isInDateRange` client path removed for this dialog (keep the lib if used elsewhere).
- [ ] Manual verification against running API + seeded drafts: search by name/phone/code narrows server-side; date preset filters; selecting a draft → "Đồng ý" opens it as before. Screenshot before/after.
- [ ] `apps/pos-web/CLAUDE.md` §13 satisfied; UI strings Vietnamese.

## Tech Approach

- Map `PosDateRangeFilterOption` ("ALL"/"TODAY"/…) to concrete `{ from, to }` ISO bounds using the existing `dateRangeFilter` helper, then to `DateRangeFilter`; "ALL" ⇒ omit `createdAt`.
- queryKey: `INVOICE_KEYS.DRAFTS_SEARCH(body)`; keep `enabled: open`.
- Right panel: `InvoiceDetailPanel` already renders from the selected row; no change unless it needs items not returned by the list endpoint — if so, fetch per-invoice on select (don't bloat the list endpoint).

## Dependencies

- Depends on: TKT-PIS-03 (endpoint), TKT-PIS-04 (data layer).
- Blocks: none.
