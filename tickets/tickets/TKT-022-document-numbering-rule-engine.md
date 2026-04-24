# TKT-022 Document numbering rule engine

## Epic

[EPIC-002 Master Data and Branch](../epics/EPIC-002-master-data-and-branch.md)

## Summary

Implement configurable document ID generation rules with prefix, suffix, timestamp tokens, and zero-padded sequence.

## Deliverables

- Rule configuration model for organization and branch scope.
- Rule components:
  - prefix
  - suffix
  - timestamp token format (example `YYYYMMDD`)
  - sequence padding length
  - reset policy (daily/monthly/yearly/no reset)
- Concurrency-safe sequence reservation and increment.
- APIs for rule CRUD/activation and number generation.
- Invoice format support example: `HD-{YYYYMMDD}-{SEQ:5}` -> `HD-20260424-00001`.

## Acceptance Criteria

- Users can configure rule pattern for invoice and other document types.
- Generated document numbers are unique and ordered by sequence within rule scope.
- Generation is race-safe under concurrent requests.
- Rule updates do not change previously generated document numbers.

## Dependencies

- [TKT-007 Branch and organization core](./TKT-007-branch-and-organization-core.md)
- [TKT-003 API app bootstrap](./TKT-003-api-app-bootstrap.md)
