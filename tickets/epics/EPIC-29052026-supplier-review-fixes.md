# EPIC-29052026-FIX Code Review Fixes — Supplier / Group / Unit EPIC

## Goal

Address all confirmed bugs and type-safety issues found in the `/review` pass of EPIC-29052026. No new features — correctness and stability only.

## Scope

- **🔴 High:** React render-phase state mutation in `ProviderGroupListPage` (breaks Strict Mode).
- **🟡 Medium:** Supplier update payload leaks display-only `groupName`; `idCardIssueDate` typed as `string` but TypeORM returns `Date`; `SupplierCreateForm` useEffect empty-deps with eslint-disable.
- **🟢 Low:** `qb: any` in CRUD service overrides; `(err as any).code` fragile cast; `TreeSelectInput` stale data on `entityKey` change; `CrudRecordDialog` useEffect missing deps.

## Tickets

- [TKT-FIX-01 ProviderGroupListPage render-phase state mutation](../tickets/TKT-FIX-01-providergroup-render-side-effect.md)
- [TKT-FIX-02 CrudRecordDialog payload + useEffect deps](../tickets/TKT-FIX-02-crud-record-dialog-payload.md)
- [TKT-FIX-03 idCardIssueDate type + SupplierCreateForm useEffect](../tickets/TKT-FIX-03-entity-type-and-form-effect.md)
- [TKT-FIX-04 TypeScript any casts + TreeSelectInput entityKey reset](../tickets/TKT-FIX-04-typescript-any-and-tree-reset.md)

## Dependencies

- All fixes are on the `feat/auto-gen-variant` branch, touching files from EPIC-29052026.
- No migration required.
- No API client regeneration required.
