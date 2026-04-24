# TKT-011 Stock transfer and adjustment

## Epic

[EPIC-003 Inventory and CSV](../epics/EPIC-003-inventory-and-csv.md)

## Summary

Implement transfer and adjustment workflows with approval and posting controls.

## Deliverables

- Transfer draft/approve/post endpoints.
- Adjustment create/approve/post endpoints.
- Reason codes and threshold approval checks.

## Acceptance Criteria

- Illegal state transitions are blocked.
- Posted transfers and adjustments are immutable.

## Dependencies

- [TKT-010 Stock ledger and balance](./TKT-010-stock-ledger-and-balance.md)
