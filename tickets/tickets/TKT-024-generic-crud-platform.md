# TKT-024 Generic CRUD platform

## Epic

[EPIC-001 Foundation and Monorepo](../epics/EPIC-001-foundation-and-monorepo.md)

## Summary

Implement a metadata-driven CRUD platform with a reusable backend base CRUD service and generic back-office CRUD pages to minimize repetitive code.

## Deliverables

- Backend `BaseCrudService` with reusable list/get/create/update/delete behavior.
- Entity metadata registry for managed types and per-entity policies.
- Generic back-office CRUD page framework (table, filters, forms, detail view).
- Default cascade support for relation-aware CRUD operations in base service.
- RBAC + branch scope enforcement integrated into generic CRUD flow.
- Audit logging for all generic CRUD mutations.
- Initial managed entity configurations:
  - invoices
  - providers
  - customers
  - orders
  - accounts
  - payables
  - receivables
  - expenses

## Acceptance Criteria

- New managed entity can be onboarded primarily through metadata/config, not duplicated page/service scaffolding.
- Generic CRUD uses consistent pagination/filter/sort behavior.
- Domain-specific restrictions (example: immutable posted documents) are enforceable via hooks/policies.
- CRUD actions are branch-scoped and auditable.
- Cascade behavior is enabled by default, with per-entity override for restrict/custom policies.

## Dependencies

- [TKT-003 API app bootstrap](./TKT-003-api-app-bootstrap.md)
- [TKT-004 Backoffice app bootstrap](./TKT-004-backoffice-app-bootstrap.md)
