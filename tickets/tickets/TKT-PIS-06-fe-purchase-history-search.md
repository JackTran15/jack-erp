# TKT-PIS-06 FE: Wire "Lịch sử mua hàng" to server-side search (#2)

## Epic

[EPIC-03062026 POS server-side invoice search](../epics/EPIC-03062026-pos-invoice-search.md)

## Summary

Re-wire the `PurchaseHistoryTab` (inside `CustomerDetailDialog`) filter row (Ngày hóa đơn, Số hóa đơn, Tên cửa hàng, Trạng thái, Tổng thanh toán) to drive `useCustomerPurchaseHistory(customerId, …)` server-side. Remove the in-memory `matchesDateFilter`/`matchesTextFilter`/`matchesNumberFilter` calls and the hard-coded `page=1/pageSize=100` paging.

## Deliverables

- `apps/pos-web/src/hooks/react-query/use-query-customer.ts` — `useCustomerPurchaseHistory` now takes `(customerId, body, { enabled })` and calls `invoiceService.searchPurchaseHistory`. (If the hook currently lives here it stays here; do not move React-Query hooks out of `react-query/`.)
- `apps/pos-web/src/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/PurchaseHistoryTab/PurchaseHistoryTab.tsx` — keep `PosDataTableFilterCell` + the status `PosSelect`; bind to filter state; map via `invoiceFilterToBody`; render `branchName` (Tên cửa hàng) from the row; real pagination from server `total`.

## Acceptance Criteria

- [ ] Filters hit the server for `customerId`; results span the customer's stores (org-wide), with "Tên cửa hàng" showing `branchName` per row.
- [ ] "Ngày hóa đơn" `≤` → `issuedAt` DateRange `{ to }`; "Số hóa đơn" `*`/operator → `code` String; "Tên cửa hàng" `=` → `storeName` String (EQUALS); "Trạng thái" dropdown → `status` Enum ("Tất cả" ⇒ omit, "Đã thanh toán" ⇒ `paid`, "Ghi nợ" ⇒ `debt`); "Tổng thanh toán" `≤` → `totalPaid` Compare.
- [ ] Drafts excluded (BE enforces `isDraft=false`); only fetched when the tab is active (lazy `enabled`).
- [ ] Pagination reflects server `total` (replaces the hard-coded `total=filtered.length`, `totalPages=1`).

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` passes; the `mapInvoicesToPurchaseHistory` mapper now consumes server rows incl. `branchName`/`totalPaid`/`status`; client-side `matches*` calls removed.
- [ ] Manual verification: open a customer with multi-store, multi-status history → each filter narrows server-side, store name renders, status dropdown filters, paging works. Screenshot before/after.
- [ ] `apps/pos-web/CLAUDE.md` §13 satisfied; UI strings Vietnamese.

## Tech Approach

- `customerId` is the required body field; gate the query with `enabled: tabActive && !!customerId`.
- The status filter is a dedicated `PosSelect` (separate from the column cells) → map its value to `EnumFilter | undefined`.
- Debounce text/number cells in the tab; `PosSelect` and date can fire immediately.
- queryKey: `INVOICE_KEYS.PURCHASE_HISTORY(customerId, body)`.

## Dependencies

- Depends on: TKT-PIS-02 (endpoint), TKT-PIS-04 (data layer).
- Blocks: none.
