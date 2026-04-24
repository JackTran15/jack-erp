# TKT-008 Customer module

## Epic

[EPIC-002 Master Data and Branch](../epics/EPIC-002-master-data-and-branch.md)

## Summary

Deliver customer CRUD, dedupe checks, merge flow, and search features.

## Deliverables

- Customer APIs with validation for name/email/address/phone.
- Duplicate detection strategy implementation.
- Merge endpoint with referential-safe behavior.

## Acceptance Criteria

- Required field validation enforced at API boundary.
- Merge emits auditable before/after state details.

## Dependencies

- [TKT-003 API app bootstrap](./TKT-003-api-app-bootstrap.md)
- [TKT-024 Generic CRUD platform](./TKT-024-generic-crud-platform.md)
