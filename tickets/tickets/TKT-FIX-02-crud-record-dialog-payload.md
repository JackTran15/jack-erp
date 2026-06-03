# TKT-FIX-02 CrudRecordDialog: payload leaks display keys + stale useEffect deps

## Epic

[EPIC-29052026-FIX Code Review Fixes](../epics/EPIC-29052026-supplier-review-fixes.md)

## Layer

🟩 Frontend only (backoffice-web).

## Summary

Two bugs in `CrudRecordDialog.tsx`:

**Bug A — payload leaks display-only keys:** `buildPayload()` for `inventory-providers` sends `{ ...values }`, which includes `groupName` (server-resolved computed field) and `code` (auto-generated on create; should not be overwritten on edit). These should be stripped before sending to the API.

**Bug B — useEffect missing deps suppressed with eslint-disable:** The form-initialization `useEffect` uses `editableFields`, `isEdit`, and `isSupplier` without listing them in the dependency array. They are functionally stable (derived from `config`/`recordId`), but the eslint-disable comment hides the issue. Adding them to deps (with `editableFields` already memoized) makes the code correct and removes the suppression.

## Deliverables

- `apps/backoffice-web/src/components/crud/CrudRecordDialog.tsx`:

  **Fix A:** Define a `DISPLAY_ONLY_KEYS` set and filter in `buildPayload`:
  ```ts
  const DISPLAY_ONLY_KEYS = new Set(["groupName", "parentGroupName"]);

  const buildPayload = () => {
    if (isSupplier) {
      const payload = { ...values };
      DISPLAY_ONLY_KEYS.forEach((k) => delete payload[k]);
      if (isEdit) delete payload.code; // code is auto-generated; don't overwrite on edit
      return payload;
    }
    return Object.fromEntries(editableFields.map((f) => [f.key, values[f.key]]));
  };
  ```

  **Fix B:** Replace the `// eslint-disable-next-line react-hooks/exhaustive-deps` comment with the full dep array:
  ```ts
  }, [open, record, config, editableFields, isEdit, isSupplier]);
  ```

## Acceptance Criteria

- [ ] DevTools Network tab shows PATCH `inventory-providers` body does NOT contain `groupName` or `parentGroupName`.
- [ ] On edit, `code` field is NOT sent in the PATCH body.
- [ ] No `eslint-disable` comment in the useEffect.
- [ ] `pnpm --filter @erp/backoffice-web build` passes.

## Definition of Done

- [ ] PR with both fixes; no eslint-disable in the changed file.

## Dependencies

- None.
