# TKT-010 Stock ledger and balance

## Epic

[EPIC-003 Inventory and CSV](../epics/EPIC-003-inventory-and-csv.md)

## Summary

Build immutable stock ledger postings and branch/location stock balance projections.

## Deliverables

- Stock ledger entry write service.
- Balance projection/update strategy.
- Stock query APIs for item/location/branch.

## Acceptance Criteria

- Every stock movement emits ledger records.
- Balances can be recalculated from ledger source.

## Dependencies

- [TKT-009 Inventory location hierarchy](./TKT-009-inventory-location-hierarchy.md)
