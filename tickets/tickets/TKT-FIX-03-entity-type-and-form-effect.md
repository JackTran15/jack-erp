# TKT-FIX-03 provider.entity.ts idCardIssueDate type + SupplierCreateForm useEffect

## Epic

[EPIC-29052026-FIX Code Review Fixes](../epics/EPIC-29052026-supplier-review-fixes.md)

## Layer

🟦🟩 Fullstack.

## Summary

Two bugs:

**Bug A — `idCardIssueDate` type mismatch (BE):** In `provider.entity.ts`, `idCardIssueDate` is declared `type: 'date'` in TypeORM but typed as `string` in TypeScript. TypeORM's pg driver deserializes `date` columns as JavaScript `Date` objects, not strings. Without a transformer, the frontend receives a full ISO timestamp string (e.g. `"1990-01-15T00:00:00.000Z"`) and the `<input type="date">` shows nothing or `"1990-01-15"` depending on slicing. With a transformer, we guarantee `YYYY-MM-DD` string consistently.

**Bug B — `SupplierCreateForm` useEffect empty-deps (FE):** The group-picker prefill `useEffect` uses `values.groupId` and `values.groupName` but has an empty `[]` dep array with an eslint-disable comment. On re-renders this is safe (runs once) but the pattern is incorrect and hides regressions.

## Deliverables

**Fix A:** `apps/api/src/modules/inventory/location/provider.entity.ts` — Add a `transformer` to the `idCardIssueDate` column:
```ts
@Column({
  name: 'id_card_issue_date',
  type: 'date',
  nullable: true,
  transformer: {
    to: (v: string | undefined) => v || null,
    from: (v: Date | string | null) =>
      v ? new Date(v).toISOString().slice(0, 10) : undefined,
  },
  comment: 'Date national ID was issued (YYYY-MM-DD)',
})
idCardIssueDate?: string;
```

**Fix B:** `apps/backoffice-web/src/components/crud/inventory/SupplierCreateForm.tsx` — Replace empty-deps + eslint-disable with a `useRef` mount flag:
```ts
const prefillDone = useRef(false);
useEffect(() => {
  if (prefillDone.current) return;
  if (values.groupId && values.groupName) {
    prefillDone.current = true;
    setGroupSummary({ name: String(values.groupName), code: "" });
    setGroupSearch(String(values.groupName));
  }
}, [values.groupId, values.groupName]);
```
Remove the `// Only run once on mount` comment and `// eslint-disable-next-line` line.

## Acceptance Criteria

- [ ] Edit a supplier that has `idCardIssueDate` set → `<input type="date">` shows `YYYY-MM-DD` correctly (not empty, not `[object Object]`, not full ISO).
- [ ] No eslint-disable in `SupplierCreateForm.tsx`.
- [ ] `pnpm --filter @erp/api build` passes.
- [ ] `pnpm --filter @erp/backoffice-web build` passes.

## Definition of Done

- [ ] PR with both fixes; no new eslint-disable comments.

## Tech Approach

- No migration needed — the transformer is applied at the ORM layer, not stored differently in the DB.
- The `from` transformer normalizes both `Date` (pg driver path) and `string` (already-serialized path) inputs.

## Dependencies

- None.
