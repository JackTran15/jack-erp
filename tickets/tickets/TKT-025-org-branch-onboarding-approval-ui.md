# TKT-025 Org/branch onboarding approval UI

## Epic

[EPIC-002 Master Data and Branch](../epics/EPIC-002-master-data-and-branch.md)

## Summary

Implement UI and workflow APIs for organization/branch registration requests that require superadmin approval before activation.

## Deliverables

- Organization registration request page.
- Branch registration request page.
- Superadmin approval queue page (list/filter/detail).
- Approve/reject actions with mandatory reason for rejection.
- Request status lifecycle support: `pending_approval`, `approved`, `rejected`, `resubmitted`.
- Audit trail visibility for each request.

## Acceptance Criteria

- Newly registered organizations/branches are inactive until superadmin approval.
- Superadmin can approve/reject requests from one approval queue flow.
- Branch and organization statuses transition correctly and are audited.
- Users without approval permissions cannot approve/reject requests.

## Dependencies

- [TKT-004 Backoffice app bootstrap](./TKT-004-backoffice-app-bootstrap.md)
- [TKT-006 Auth and RBAC core](./TKT-006-auth-and-rbac-core.md)
- [TKT-007 Branch and organization core](./TKT-007-branch-and-organization-core.md)
