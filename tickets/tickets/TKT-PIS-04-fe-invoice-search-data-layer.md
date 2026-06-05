# TKT-PIS-04 FE: Invoice-search data layer (DTOs + service + hooks + filter mapper)

## Epic

[EPIC-03062026 POS server-side invoice search](../epics/EPIC-03062026-pos-invoice-search.md)

## Summary

Build the shared pos-web data layer the three screens consume: hand-written request/response DTOs for the new endpoints, `invoiceService` methods, `INVOICE_KEYS`, react-query hooks, and a **pure mapper** that turns the existing `ColumnFilterState` (operator + value from `PosDataTableFilterCell`) into the V2 filter body shapes. No UI here — just the layer the screen tickets wire to. Strictly follows `apps/pos-web/CLAUDE.md` (services-only API calls, query keys centralised, no `index.ts`, named exports, `@erp/pos/...` imports).

## Deliverables

- `apps/pos-web/src/dtos/invoice.dto.ts` (extend) — add:
  - `SearchReturnableInvoicesBody`, `SearchPurchaseHistoryBody`, `SearchDraftInvoicesBody`.
  - response rows: extend/define `InvoiceSearchV2Response`-style `{ data, total, page, limit }` returns (reuse existing `StringFilter`/`CompareFilter`/`DateRangeFilter`/`EnumFilter` already declared in this file).
- `apps/pos-web/src/interfaces/invoice.interface.ts` (extend) — add inline fields used by these screens to the relevant row type(s): `branchName?`, `customerName?`, `customerPhone?`, `totalPaid?` (only if not already present on `InvoiceRow`).
- `apps/pos-web/src/services/invoice.service.ts` (extend `invoiceService`) — `searchReturnable`, `searchPurchaseHistory`, `searchDrafts`, each `http.post` to the matching `/v2/invoices/.../search`.
- `apps/pos-web/src/constants/react-query-key.constant.ts` (extend `INVOICE_KEYS`) — `RETURNABLE(filters)`, `PURCHASE_HISTORY(customerId, filters)`, `DRAFTS_SEARCH(filters)` as parameterised tuples starting with `'invoices'`.
- `apps/pos-web/src/hooks/react-query/use-query-invoice.ts` (rewrite the 3 hooks) — `useReturnableInvoicesQuery`, `useCustomerPurchaseHistory`, `useDraftInvoicesQuery` now take filter/pagination args and call the new service methods (server-side). queryFn calls the service; queryKey from `INVOICE_KEYS`.
- `apps/pos-web/src/lib/common/invoiceFilterToBody.ts` (new) — pure functions mapping `FilterOperatorEnum` + value → backend filter shapes.

## Acceptance Criteria

- [ ] Mapper translates each `FilterOperatorEnum` to the backend symbol: `CONTAINS→'*'`, `EQUALS→'='`, `STARTS_WITH→'+'`, `ENDS_WITH→'-'`, `NOT_CONTAINS→'!'` (StringFilter); `EQUALS→'='`, `LESS_THAN→'<'`, `LESS_THAN_OR_EQUAL→'<='`, `GREATER_THAN→'>'`, `GREATER_THAN_OR_EQUAL→'>='` (CompareFilter). A `≤` date cell → `DateRangeFilter { to }`; a `≥`/`from`-style date → `{ from }`. Empty value → omit the filter entirely (no `{operator, value:''}` sent).
- [ ] Service methods post to `/v2/invoices/returnable/search`, `/v2/invoices/purchase-history/search`, `/v2/invoices/drafts/search` and return the typed `{ data, total, page, limit }`.
- [ ] No API call is made outside `invoiceService`; no `http.*` inside hooks/components; no inline queryKey strings; no new `index.ts`; named exports only.
- [ ] queryKeys start with `'invoices'` so `INVOICE_KEYS.ALL` prefix-invalidation still works.
- [ ] Hooks expose loading/error/data + the server `total` for pagination; debouncing of filter input is the screen's responsibility (pass already-debounced args in).
- [ ] DTO shapes match the BE DTOs from TKT-PIS-01/02/03 exactly (field names, optionality, `customerId` required on purchase-history).

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (typecheck) passes; no unused exports left from the old client-side hooks.
- [ ] Mapper has a focused unit test (or, if pos-web has no test runner wired, a usage example exercised by the screen tickets) covering each operator + the empty-value omission.
- [ ] No backend changes in this ticket.
- [ ] Conventions in `apps/pos-web/CLAUDE.md` §6/§8.1/§10/§11 satisfied (verify the checklist in §13).

## Tech Approach

```ts
// src/dtos/invoice.dto.ts  (reuse the existing StringFilter/CompareFilter/DateRangeFilter/EnumFilter)
export interface SearchReturnableInvoicesBody {
  page?: number; limit?: number;
  code?: StringFilter; createdAt?: DateRangeFilter;
  customerName?: StringFilter; customerPhone?: StringFilter;
  totalPaid?: CompareFilter; branchName?: StringFilter;
}
export interface SearchPurchaseHistoryBody {
  customerId: string;                       // required
  page?: number; limit?: number;
  code?: StringFilter; issuedAt?: DateRangeFilter;
  storeName?: StringFilter; status?: EnumFilter; totalPaid?: CompareFilter;
}
export interface SearchDraftInvoicesBody {
  page?: number; limit?: number;
  search?: string; createdAt?: DateRangeFilter; sessionId?: string;
}
```

```ts
// src/lib/common/invoiceFilterToBody.ts
import { FilterOperatorEnum } from "@erp/pos/constants/checkout.constant";
import type { ColumnFilterState } from "@erp/pos/interfaces/column-filter.interface";

export function toStringFilter(s?: ColumnFilterState) { /* ⇒ {operator:'*'|…, value} | undefined */ }
export function toCompareFilter(s?: ColumnFilterState) { /* ⇒ {operator:'='|'<='|…, value:number} | undefined */ }
export function toDateRangeFrom(state?: ColumnFilterState) { /* ⇒ {from|to} | undefined */ }
```

```ts
// src/services/invoice.service.ts  (add to invoiceService object)
searchReturnable: (b: SearchReturnableInvoicesBody): Promise<InvoiceSearchV2Response> =>
  http.post<InvoiceSearchV2Response>("/v2/invoices/returnable/search", b),
searchPurchaseHistory: (b: SearchPurchaseHistoryBody): Promise<InvoiceSearchV2Response> =>
  http.post<InvoiceSearchV2Response>("/v2/invoices/purchase-history/search", b),
searchDrafts: (b: SearchDraftInvoicesBody): Promise<InvoiceSearchV2Response> =>
  http.post<InvoiceSearchV2Response>("/v2/invoices/drafts/search", b),
```

> The three react-query hooks already exist (today they fetch old endpoints + client-filter). Rewrite their bodies in place — keep the export names so importers don't churn, but change the signatures to accept the filter/page args and return server `total`. Note in the PR which old service calls (`list`, `listDrafts`) become unused by these hooks (do NOT delete them if other code still uses them — flag instead).

## Testing Strategy

- Typecheck via `build`. Mapper unit test for operator coverage + empty-omission. Functional verification happens in TKT-PIS-05/06/07 against the running API.

## Dependencies

- Depends on: TKT-PIS-01, TKT-PIS-02, TKT-PIS-03 (endpoints must exist to call/type against).
- Blocks: TKT-PIS-05, TKT-PIS-06, TKT-PIS-07.
