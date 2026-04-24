# TKT-015 Accounting COA and journals

## Epic

[EPIC-004 POS and Accounting](../epics/EPIC-004-pos-and-accounting.md)

## Summary

Build chart of accounts management and immutable double-entry journal posting.

## Deliverables

- COA APIs and validation rules.
- Journal posting service with balance checks.
- Journal reversal workflow.

## Acceptance Criteria

- Unbalanced journals are rejected.
- Posted journals cannot be edited.

## Dependencies

- [TKT-003 API app bootstrap](./TKT-003-api-app-bootstrap.md)
- [TKT-022 Document numbering rule engine](./TKT-022-document-numbering-rule-engine.md)
- [TKT-024 Generic CRUD platform](./TKT-024-generic-crud-platform.md)
