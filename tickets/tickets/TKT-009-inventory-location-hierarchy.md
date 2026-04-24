# TKT-009 Inventory location hierarchy

## Epic

[EPIC-003 Inventory and CSV](../epics/EPIC-003-inventory-and-csv.md)

## Summary

Implement branch storage/showroom/location hierarchy and management APIs.

## Deliverables

- Storage, showroom, and location entities.
- CRUD and lookup APIs.
- Main storage/main showroom flags and validation rules for main branch.
- Branch storage manager assignment support.
- Branch ownership and consistency checks.

## Acceptance Criteria

- Hierarchy supports inventory posting workflows.
- Invalid cross-branch hierarchy assignments are blocked.
- Main storage/main showroom can only be configured under main branch.
- Storage manager assignments are branch-scoped and permission-gated.

## Dependencies

- [TKT-007 Branch and organization core](./TKT-007-branch-and-organization-core.md)
