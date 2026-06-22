# TKT-TWF-05 FE: clear stale Vị trí xuất/nhập when "Chọn kho" changes the warehouse

## Epic

[EPIC-21062026 Chuyển kho — chọn kho + auto-fill](../epics/EPIC-21062026-transfer-warehouse-fill.md)

## Summary

Bug-fix follow-up to TKT-TWF-03. When the combined **"Chọn kho"** dialog applies a new Kho xuất / Kho nhập to every line, the per-line **Vị trí xuất/nhập** (shelf) is not reset first, so any line whose item has no preferred shelf at the new warehouse (or has no item yet) keeps the **old warehouse's shelf** — an invalid, storage-mismatched position. Clear the location fields on warehouse change so `fillTransferLocations` either repopulates a valid shelf or leaves the field blank ("Mặc định").

## Problem

In `StockTransferPage.tsx`, `applyTransferWarehouses(source, dest)` overwrites only the storage fields:

```ts
const updated = lines.map((l) => ({
  ...l,
  sourceStorageId: source.id, sourceStorageLabel: source.name,
  destStorageId: dest.id,     destStorageLabel: dest.name,
  // sourceLocationId / destLocationId NOT cleared
}));
```

`fillTransferLocations` then only overwrites a position when the new warehouse returns a preferred shelf, and **falls back to the old value otherwise** (`r.sourceShelf?.id ?? l.sourceLocationId`). It also skips lines with no `itemId`. Result: lines without a preferred shelf at the new storage keep the previous warehouse's shelf — exactly the reported symptom ("vị trí nhập/xuất không clear, đang lấy vị trí của kho cũ").

Positions are **storage-scoped** — the inline per-line storage selectors already clear them on change (`onSelect` sets `sourceLocationId: "", sourceLocationLabel: ""`, comment: *"Locations are storage-scoped — drop the previous pick"*). The combined dialog path just wasn't given the same treatment.

## Deliverables

- `apps/backoffice-web/src/pages/stock-transfer/StockTransferPage.tsx` — in `applyTransferWarehouses`, reset the four location fields when overwriting storage, mirroring the inline selectors:

```ts
const updated = lines.map((l) => ({
  ...l,
  sourceStorageId: source.id,
  sourceStorageLabel: source.name,
  sourceLocationId: "",
  sourceLocationLabel: "",
  destStorageId: dest.id,
  destStorageLabel: dest.name,
  destLocationId: "",
  destLocationLabel: "",
}));
setLines(updated);
markDirty();
void fillTransferLocations(updated);
```

## Acceptance Criteria

- [ ] After "Chọn kho" changes the warehouse, every line's Vị trí xuất/nhập is reset before auto-fill.
- [ ] Lines whose item has a preferred shelf at the new warehouse show that shelf; lines without one show empty ("Mặc định"), **never** the previous warehouse's shelf.
- [ ] Lines with no item selected show empty Vị trí (no stale value).
- [ ] No change to the inline per-line storage/location selectors (they already clear correctly) or to the save payload.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` (tsc) passes.
- [ ] Manual: add items, "Chọn kho" warehouse A → note shelves; "Chọn kho" warehouse B → no shelf shows A's value; lines with a preferred shelf at B fill, others blank.
- [ ] Diff limited to `applyTransferWarehouses`; no other behavior touched.

## Tech Approach

Pure FE state fix — four added lines in one function. No new API, no migration, no dependency change. `fillTransferLocations` is unchanged: it now merges onto cleared fields, so its `?? l.sourceLocationId` fallback resolves to `""` instead of the stale shelf.

## Dependencies

- Depends on: TKT-TWF-03 (introduced `applyTransferWarehouses` / `fillTransferLocations`).
- Blocks: none.
