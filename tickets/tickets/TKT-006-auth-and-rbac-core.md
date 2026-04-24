# TKT-006 Auth and RBAC core

## Epic

[EPIC-002 Master Data and Branch](../epics/EPIC-002-master-data-and-branch.md)

## Summary

Implement authentication, role permissions, and branch-scoped authorization guardrails.

## Deliverables

- JWT authentication flow.
- Redis-backed session validation for JWT token acceptance/revocation.
- Permission model and role mapping.
- Branch scope enforcement middleware/guards.
- Permission gates for branch dashboard vs consolidated dashboard access.
- Permission gates for org/branch registration submit and superadmin approval actions.
- Role access rules for salesman, sales manager, storage admin/manager, branch admin, and org owner.

## Acceptance Criteria

- Unauthorized requests return expected errors.
- Branch leakage tests fail-safe (deny by default).
- Branch admins cannot access ungranted branch reports.
- Consolidated dashboard access is available only with dedicated permission.
- Only superadmin-approved roles can approve/reject org/branch registration requests.
- Revoked/expired Redis sessions immediately invalidate JWT access.

## Dependencies

- [TKT-003 API app bootstrap](./TKT-003-api-app-bootstrap.md)
