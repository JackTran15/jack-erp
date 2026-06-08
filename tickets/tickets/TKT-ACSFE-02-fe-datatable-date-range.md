# TKT-ACSFE-02 BaseDataTable: date-range filter kind

## Epic

[EPIC-03062026 Backoffice admin list server-side search — FE wiring](../epics/EPIC-03062026-admin-list-cqrs-search-fe.md)

## Summary

Add a `date-range` filter kind to `BaseDataTable` so a date column can render a `from`/`to` pair that maps to the v2 `createdAt` `DateRangeFilter`. Pure additive extension — existing `symbol`/`select`/`date`/`time`/`none` kinds are untouched.

## Deliverables

- `apps/backoffice-web/src/components/table/BaseDataTable.tsx`:
  - Extend `ColumnFilterKind` with `"date-range"`.
  - In the filter row, render two `<input type="date">` (from / to) for that kind.
  - Extend `ColumnFilterControl` with `onRangeChange(fieldKey, part: 'from'|'to', value: string)`.
- `apps/backoffice-web/src/components/table/pagination.dto.ts` (or wherever `ColumnFilter` lives):
  - Extend `ColumnFilter` with optional `from?: string; to?: string`.

## Acceptance Criteria

- [ ] A column with `filterKind: "date-range"` renders two date inputs; editing either calls `onRangeChange`.
- [ ] All other filter kinds render and behave exactly as before (no regression).
- [ ] `ColumnFilter.from/to` are optional and ignored by the existing `applyColumnFilter` (client-side path unaffected).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` passes.
- [ ] No visual/behavioral change to any list that does not use `date-range`.

## Tech Approach

```tsx
// inside the filter <tr>, per column:
kind === "date-range" ? (
  <div className="flex items-center gap-1">
    <input type="date" value={activeFilter?.from ?? ""}
      onChange={(e) => columnFilterControl.onRangeChange?.(column.key, "from", e.target.value)} />
    <span className="text-xs text-muted-foreground">–</span>
    <input type="date" value={activeFilter?.to ?? ""}
      onChange={(e) => columnFilterControl.onRangeChange?.(column.key, "to", e.target.value)} />
  </div>
) : /* existing kinds */
```

## Dependencies

- Depends on: none.
- Blocks: TKT-ACSFE-03, TKT-ACSFE-04.
