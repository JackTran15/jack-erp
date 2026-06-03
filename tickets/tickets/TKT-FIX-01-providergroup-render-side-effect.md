# TKT-FIX-01 ProviderGroupListPage: render-phase state mutation

## Epic

[EPIC-29052026-FIX Code Review Fixes](../epics/EPIC-29052026-supplier-review-fixes.md)

## Layer

🟩 Frontend only (backoffice-web).

## Summary

`ProviderGroupListPage` calls `setExpanded()` and `setAutoExpanded()` directly in the render body (lines 138-142). React Strict Mode double-invokes renders, which triggers duplicate state updates on every render cycle until `autoExpanded` flips — in practice this causes a flicker and will be a warning/error in future React versions.

## Deliverables

- `apps/backoffice-web/src/pages/inventory/ProviderGroupListPage.tsx`:
  - Remove `const [autoExpanded, setAutoExpanded] = useState(false)` state variable.
  - Remove the `if (!autoExpanded && allIds.length > 0) { ... }` block from the render body.
  - Add a `useRef<boolean>(false)` named `didAutoExpand`.
  - Add a `useEffect` that checks `!didAutoExpand.current && allIds.length > 0`, calls `setExpanded(new Set(allIds))`, and sets `didAutoExpand.current = true`. Dep array: `[allIds]` (stable array reference changes only when tree data loads).

## Acceptance Criteria

- [ ] No React warning about state updates during render in the browser console.
- [ ] Supplier groups auto-expand on first load (same behavior as before).
- [ ] Subsequent refetches do NOT re-collapse the tree (the `useRef` flag prevents re-triggering).
- [ ] `pnpm --filter @erp/backoffice-web build` passes.

## Definition of Done

- [ ] PR with the fix; no new eslint-disable comments.

## Tech Approach

```ts
const didAutoExpand = useRef(false);

useEffect(() => {
  if (!didAutoExpand.current && allIds.length > 0) {
    setExpanded(new Set(allIds));
    didAutoExpand.current = true;
  }
}, [allIds]);
```

## Dependencies

- None.
