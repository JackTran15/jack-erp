# TKT-CPP-02 FE: CounterpartyPickerField/Modal + useCounterpartySearch hook

## Epic

[EPIC-21062026 Counterparty picker redesign](../epics/EPIC-21062026-counterparty-picker-redesign.md)

## Summary

Build the redesigned "Chọn đối tượng" dialog as a dedicated `CounterpartyPickerField` + `CounterpartyPickerModal` pair (not by overloading the generic `LookupSearchModal`). The modal adds a **"Loại đối tượng" dropdown** and the 5 columns (Mã đối tượng · Tên đối tượng · Loại đối tượng · Điện thoại · Địa chỉ), single-select, paginated, fed by a `useCounterpartySearch` TanStack Query hook over `POST /v2/counterparties/search`. This ticket builds the component in isolation; TKT-CPP-03 wires it into the 3 consumers.

## Deliverables

- `apps/backoffice-web/src/hooks/useCounterpartySearch.ts` (new) — TanStack Query hook calling `erpApi.POST("/v2/counterparties/search", ...)` via `requireErpData`; queryKey `["counterparties-search", type, search, page, pageSize]`; returns `{ data, total, page, pageSize }`.
- `apps/backoffice-web/src/components/forms/CounterpartyPickerModal.tsx` (new) — dialog with:
  - Header row: a `Select` (Loại đối tượng → `Tất cả | Nhà cung cấp | Khách hàng | Nhân viên`) + search input + "Tìm kiếm" button.
  - Table columns: `Mã đối tượng` (code), `Tên đối tượng` (name), `Loại đối tượng` (kind→VN label), `Điện thoại` (phone), `Địa chỉ` (address).
  - Single-select (`selectedKey`), double-click or "Chọn" confirms; "Hủy bỏ" closes. Pagination footer (reuse `LookupSearchModal`'s pattern / `PaginationControls`).
- `apps/backoffice-web/src/components/forms/CounterpartyPickerField.tsx` (new) — input + "open modal" trigger mirroring `LookupField`'s API (`value`, `onValueChange`, `onSelect`), forwarding picker props.
- A `kind → Vietnamese label` map: `supplier→"Nhà cung cấp"`, `customer→"Khách hàng"`, `employee→"Nhân viên"`.

## Acceptance Criteria

- [ ] Dialog renders the type dropdown + all 5 columns; changing the dropdown re-queries server-side and resets to page 1.
- [ ] `"Tất cả"` sends `type: all` (merged results); each specific option sends its `CounterpartyKind`.
- [ ] Props `defaultType?: CounterpartyKind` and `allowedTypes?: CounterpartyKind[]` control the dropdown's initial value and visible options (so a consumer can lock to one type or constrain the list).
- [ ] Selecting a row calls `onSelect({ kind, id, code, name, phone, address })`; single-select only (no checkboxes).
- [ ] Search input is debounced or commit-on-button (match existing `LookupSearchModal` behavior); pagination total reflects server `total`.
- [ ] UI strings Vietnamese; empty-state and loading handled.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` passes.
- [ ] Component renders in isolation against the live endpoint (temporary mount or Storybook-style harness) before wiring consumers.
- [ ] No new server data placed in Zustand (search state lives in TanStack Query / local component state).

## Tech Approach

```tsx
interface CounterpartyOption {
  kind: "supplier" | "customer" | "employee";
  id: string; code: string | null; name: string;
  phone: string | null; address: string | null;
}

interface CounterpartyPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (c: CounterpartyOption) => void;
  defaultType?: CounterpartyKind;       // initial dropdown value, default "all"
  allowedTypes?: CounterpartyKind[];    // restrict dropdown options
  title?: string;                       // default "Chọn đối tượng"
}

const KIND_LABEL: Record<string, string> = {
  supplier: "Nhà cung cấp", customer: "Khách hàng", employee: "Nhân viên",
};

// useCounterpartySearch
const { data } = useQuery({
  queryKey: ["counterparties-search", type, search, page, pageSize],
  queryFn: () => requireErpData(erpApi.POST("/v2/counterparties/search", {
    body: { type, search, page, pageSize },
  })),
  enabled: open,
});
```

Columns (single-select table):

| key | label | render |
| --- | ----- | ------ |
| code | Mã đối tượng | `c.code` (font-mono) |
| name | Tên đối tượng | `c.name` |
| kind | Loại đối tượng | `KIND_LABEL[c.kind]` |
| phone | Điện thoại | `c.phone ?? "—"` |
| address | Địa chỉ | `c.address ?? "—"` |

## Testing Strategy

- Manual against live API: each dropdown value returns the right entity set; pagination + select work; row maps to `onSelect` payload.

## Dependencies

- Depends on: TKT-CPP-01 (regenerated `@erp/api-client` types for `/v2/counterparties/search`).
- Blocks: TKT-CPP-03.
