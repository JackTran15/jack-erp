# EPIC-002 Master Data and Branch

## Goal

Deliver secure core business entities and multi-branch controls required before transactional modules.

## Scope

- Authentication and RBAC baseline.
- Organization and branch model.
- Organization/branch onboarding registration and superadmin approval flow.
- Sales hierarchy management (salesman and sales manager by branch).
- Customer management module.
- Configurable document numbering rule engine.

## Success Metrics

- Branch-scoped authorization enforced in APIs.
- Customer CRUD and dedupe flows available.
- Audit logs produced for critical mutations.

## Tickets

- [TKT-006 Auth and RBAC core](../tickets/TKT-006-auth-and-rbac-core.md)
- [TKT-007 Branch and organization core](../tickets/TKT-007-branch-and-organization-core.md)
- [TKT-025 Org/branch onboarding approval UI](../tickets/TKT-025-org-branch-onboarding-approval-ui.md)
- [TKT-026 Branch sales hierarchy management](../tickets/TKT-026-branch-sales-hierarchy-management.md)
- [TKT-008 Customer module](../tickets/TKT-008-customer-module.md)
- [TKT-022 Document numbering rule engine](../tickets/TKT-022-document-numbering-rule-engine.md)

## Dependencies

- Depends on [EPIC-001 Foundation and Monorepo](./EPIC-001-foundation-and-monorepo.md).
