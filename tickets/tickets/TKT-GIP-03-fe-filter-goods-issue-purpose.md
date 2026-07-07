# TKT-GIP-03 FE: filter goods-issue purpose options by permission

## Epic

[EPIC-05072026 Inventory & report corrections](../epics/EPIC-05072026-inventory-report-corrections.md)

## Summary

Hide the "Xuất khác" and "Hủy hàng" purpose options in the goods-issue form for users who lack
the matching permission. "Điều chuyển đến cửa hàng khác" is always shown. Mirrors the server
gate from TKT-GIP-02 so the UI never offers a purpose the API would reject.

## Deliverables

- `apps/backoffice-web/src/components/document/GoodsIssueFormDialog.tsx` — compute a visible
  purpose list from `MANUAL_PURPOSES` filtered by `hasPermission` (from `lib/permissions.ts`),
  and render that in the purpose `<select>` (around L1248). Keep `TRANSFER_OUT` unconditionally.
- Guard the initial/current `purpose` state (around L278-281 / `handlePurposeChange`) so a hidden
  purpose is never selected by default — fall back to the first visible option.

## Acceptance Criteria

- [x] Without `inventory.goods-issue.disposal` → "Hủy hàng" absent from the dropdown.
- [x] Without `inventory.goods-issue.other-issue` → "Xuất khác" absent.
- [x] "Điều chuyển đến cửa hàng khác" always present; it is the safe default when the current
  purpose is not permitted.
- [x] Editing an existing goods issue whose purpose the user can't create still renders read-only
  (view mode) without crashing (list uses `PURPOSE_LABELS`, unaffected).

## Definition of Done

- [x] Uses `hasPermission` from `lib/permissions.ts` (same pattern as `navConfig.ts`,
  `RoleManagementPage.tsx`).
- [x] UI strings Vietnamese; no server-data-in-Zustand.
- [x] No console warnings from an out-of-range `<select>` value.

## Tech Approach

```tsx
const visiblePurposes = MANUAL_PURPOSES.filter((p) =>
  p === 'TRANSFER_OUT' ||
  (p === 'OTHER' && hasPermission('inventory.goods-issue.other-issue')) ||
  (p === 'DISPOSAL' && hasPermission('inventory.goods-issue.disposal')));
// render visiblePurposes; default purpose = visiblePurposes[0] when current not included
```

## Testing Strategy

- Manual: toggle the two permissions in `localStorage["user_permissions"]` and confirm option
  visibility + default fallback.

## Dependencies

- Depends on: TKT-GIP-01, TKT-GIP-02.
