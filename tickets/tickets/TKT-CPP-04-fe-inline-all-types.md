# TKT-CPP-04 FE: inline field type-ahead searches all types (mixed)

## Epic

[EPIC-21062026 Counterparty picker redesign](../epics/EPIC-21062026-counterparty-picker-redesign.md)

## Summary

Follow-up to TKT-CPP-02/03. The inline type-ahead dropdown on `CounterpartyPickerField` currently searches only the field's `defaultType` (suppliers on Nhập kho), so typing a customer name like "ANH THÀNH" (KH000004) returns nothing inline. Make the inline dropdown search **across all types** (`type: "all"`) so it returns mixed Nhà cung cấp + Khách hàng + Nhân viên results — matching the reference. `defaultType` now only sets the **modal's** initial "Loại đối tượng" filter, not the inline search scope.

## Deliverables

- `apps/backoffice-web/src/components/forms/CounterpartyPickerField.tsx`:
  - Change `inlineSearch` to call `search("all", query, page, ps)` instead of `search(defaultType, query, page, ps)`.
  - Keep passing `defaultType` to `CounterpartyPickerModal` (its initial dropdown value) unchanged.
  - Drop the now-unused `defaultType` dependency from the `inlineSearch` `useCallback` deps.

## Acceptance Criteria

- [ ] On Nhập kho, typing a customer name/code in the Đối tượng field returns the matching **customer** inline (mixed with suppliers), e.g. "ANH THÀNH" → KH000004.
- [ ] On Xuất kho, typing a supplier name/code returns the matching **supplier** inline (mixed with customers).
- [ ] Inline dropdown still shows the Mã / Tên / Loại / Điện thoại columns; selecting any row fills the form fields as before.
- [ ] The search **modal** still opens with its per-page initial type (Nhập kho → Nhà cung cấp, Xuất kho → Khách hàng) and its Loại đối tượng dropdown still switches types.
- [ ] No change to the modal, the hook, or any backend.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` passes.
- [ ] Manual: run the app, open Nhập kho, type a known customer → it appears inline; open the modal → initial type still Nhà cung cấp.

## Tech Approach

```tsx
// CounterpartyPickerField.tsx — inline type-ahead searches all types
const inlineSearch = useCallback(
  async (query: string, page: number, pageSize?: number) => {
    const ps = pageSize ?? INLINE_PAGE_SIZE;
    const res = await search("all", query, page, ps); // was: search(defaultType, ...)
    return { items: res.data, hasMore: page * ps < res.total, total: res.total };
  },
  [search], // defaultType no longer referenced here
);
// defaultType still forwarded to <CounterpartyPickerModal defaultType={defaultType} ... />
```

## Testing Strategy

- Manual e2e on Nhập kho + Xuất kho (web apps have no real test runner; build + manual run is the gate).

## Dependencies

- Depends on: TKT-CPP-02 (the field/modal), TKT-CPP-03 (consumers wired).
- Blocks: none.
