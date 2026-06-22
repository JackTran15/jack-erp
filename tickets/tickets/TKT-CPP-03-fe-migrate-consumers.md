# TKT-CPP-03 FE: migrate Nhập kho / Xuất kho to the new picker

## Epic

[EPIC-21062026 Counterparty picker redesign](../epics/EPIC-21062026-counterparty-picker-redesign.md)

## Summary

Replace the two plain supplier-only "Chọn đối tượng" pickers with `CounterpartyPickerField`/`CounterpartyPickerModal` from TKT-CPP-02, retiring the legacy `GET /inventory/providers` calls. Each consumer keeps its existing form state; only the picker UI and its data source change. Set a sensible `defaultType` per surface. **Treasury is out of scope** — its `VoucherEntitySearchModal` already implements this UI on its own endpoint.

## Deliverables

- `apps/backoffice-web/src/pages/purchase-orders/PurchaseOrdersPage.tsx` (Nhập kho):
  - Swap the `LookupField` (`searchProviders` → `/inventory/providers`) in `PurchaseOrderFormDialog`'s `Đối tượng` row for `CounterpartyPickerField` with `defaultType="supplier"`.
  - Map `onSelect({kind,id,code,name})` → existing `providerId/providerCode/providerName` state.
  - Remove the now-dead `searchProviders` closure.
- `apps/backoffice-web/src/pages/goods-issue/GoodsIssuePage.tsx` (Xuất kho):
  - Same swap in `GoodsIssueFormDialog`'s `Đối tượng` row, `defaultType="customer"`; map → existing `customerId/customerCode/customerName` state. Remove dead provider-search closure.

## Acceptance Criteria

- [ ] Nhập kho opens the new dialog defaulting to **Nhà cung cấp**; selecting fills the đối tượng fields and the PO saves unchanged.
- [ ] Xuất kho opens defaulting to **Khách hàng**; selecting fills fields and the goods-issue saves unchanged.
- [ ] Neither picker calls `GET /inventory/providers` anymore (verified in network tab / grep).
- [ ] If a consumer's form persists the counterparty **kind**, the selected `kind` is passed through; otherwise existing single-field mapping is preserved (no persistence-shape change — see epic "Out of scope").
- [ ] No dead imports/closures left behind from the removed pickers.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` passes.
- [ ] Manual: run the app, exercise all three forms end-to-end (open dialog → switch type → search → select → save) against the live API.
- [ ] Screenshot the redesigned dialog on at least Nhập kho to confirm it matches the reference (dropdown + 5 columns).

## Tech Approach

```tsx
// PurchaseOrdersPage.tsx — Đối tượng row
<CounterpartyPickerField
  defaultType="supplier"
  value={providerCode}
  onValueChange={(v) => { setProviderCode(v); setProviderId(""); }}
  onSelect={(c) => { setProviderId(c.id); setProviderCode(c.code ?? ""); setProviderName(c.name); }}
/>

// GoodsIssuePage.tsx — defaultType="customer", map → customerId/customerCode/customerName
```

## Testing Strategy

- Manual e2e on the two forms (the web apps have no real test runner; build + manual run is the gate, consistent with prior FE tickets).

## Dependencies

- Depends on: TKT-CPP-02 (the picker component + hook).
- Blocks: none.
