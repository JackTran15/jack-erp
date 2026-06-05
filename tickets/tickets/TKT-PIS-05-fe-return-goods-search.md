# TKT-PIS-05 FE: Wire "Đổi trả nhanh" to server-side search (#5)

## Epic

[EPIC-03062026 POS server-side invoice search](../epics/EPIC-03062026-pos-invoice-search.md)

## Summary

Re-wire the `ReturnGoodsPage` / `ReturnInvoiceTable` filter row (Số hóa đơn, Ngày tạo, Khách hàng, Số điện thoại, Tổng thanh toán, Chi nhánh) to drive `useReturnableInvoicesQuery` server-side. Remove the in-memory `matches*` filtering; the columns now query the whole returnable dataset with pagination.

## Deliverables

- `apps/pos-web/src/hooks/page-hooks/return-goods/use-return-goods.ts` — replace client-side filtering: hold `ColumnFilterState` per column + page, debounce, map via `invoiceFilterToBody`, pass `SearchReturnableInvoicesBody` to `useReturnableInvoicesQuery`. Drop the `customerService.get()` enrichment loop — `customerName`/`customerPhone` now arrive inline from the API.
- `apps/pos-web/src/components/page-components/ReturnGoods/ReturnInvoiceTable/ReturnInvoiceTable.tsx` — keep `PosDataTableFilterCell` cells; bind to the new filter state; render `branchName` from the row; wire pagination to server `total`.

## Acceptance Criteria

- [ ] Each filter cell sends a server request (debounced ~300ms); results reflect the full SALE+PAID dataset for the active branch, not just one page.
- [ ] "Tổng thanh toán" `≤` cell maps to `totalPaid` Compare; "Ngày tạo" `≤` cell maps to `createdAt` DateRange `{ to }`; text cells map to String `*` (or the chosen operator).
- [ ] Empty filter cells send no filter key; the "Đổi trả nhanh" action still opens the existing return flow for the selected row.
- [ ] Pagination control reflects server `total`; empty state still "Chưa có hóa đơn nào."
- [ ] No `customerService.get()` N+1 loop remains for this list.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` passes; no dead imports from the removed client-side path.
- [ ] Manual verification against running API + seed: type partial code / customer name / phone / total → server narrows; paging works; selecting a row → return flow unchanged. Screenshot before/after.
- [ ] `apps/pos-web/CLAUDE.md` §13 checklist satisfied; UI strings Vietnamese.

## Tech Approach

- The `date` cell uses `parseViDate()` today; reuse it to produce the ISO value for `DateRangeFilter.to`.
- Page hook owns the debounce (`use-debounce` in `hooks/common/`); pass debounced `SearchReturnableInvoicesBody` to the hook so the queryKey changes only after the pause.
- queryKey: `INVOICE_KEYS.RETURNABLE(body)` — body is the serialisable filter+page object.

## Dependencies

- Depends on: TKT-PIS-01 (endpoint), TKT-PIS-04 (data layer).
- Blocks: none.
