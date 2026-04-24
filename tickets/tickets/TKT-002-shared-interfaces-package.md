# TKT-002 Shared interfaces package

## Epic

[EPIC-001 Foundation and Monorepo](../epics/EPIC-001-foundation-and-monorepo.md)

## Summary

Create `@erp/shared-interfaces` package for reusable domain/API contracts.

## Deliverables

- Package scaffold under `packages/shared-interfaces`.
- Core interfaces for customer, branch, inventory, accounting, and POS.
- Exported enums for workflow statuses.

## Acceptance Criteria

- Package builds independently.
- API and frontend apps can import contracts via `workspace:*`.

## Dependencies

- [TKT-001 Init pnpm workspace](./TKT-001-init-pnpm-workspace.md)
