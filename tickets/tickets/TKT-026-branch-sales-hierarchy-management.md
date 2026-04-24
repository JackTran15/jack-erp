# TKT-026 Branch sales hierarchy management

## Epic

[EPIC-002 Master Data and Branch](../epics/EPIC-002-master-data-and-branch.md)

## Summary

Implement sales hierarchy management so each branch can assign salesmen and sales managers with branch-scoped permissions.

## Deliverables

- Branch-level salesman assignment APIs and UI management page.
- Branch-level sales manager assignment APIs and UI management page.
- Validation to ensure assignments stay within granted branch scope.
- Audit trail for assignment/unassignment actions.

## Acceptance Criteria

- Branch admins can manage sales hierarchy only for permitted branches.
- Salesman and sales manager assignments are visible in branch management UI.
- Assignment changes are auditable and permission-gated.

## Dependencies

- [TKT-006 Auth and RBAC core](./TKT-006-auth-and-rbac-core.md)
- [TKT-007 Branch and organization core](./TKT-007-branch-and-organization-core.md)
- [TKT-024 Generic CRUD platform](./TKT-024-generic-crud-platform.md)
