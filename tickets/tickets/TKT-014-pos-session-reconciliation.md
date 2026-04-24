# TKT-014 POS session reconciliation

## Epic

[EPIC-004 POS and Accounting](../epics/EPIC-004-pos-and-accounting.md)

## Summary

Implement POS session open/close with expected-vs-actual cash reconciliation.

## Deliverables

- Session lifecycle APIs.
- Variance calculation and threshold policy checks.
- Supervisor approval path for large variance.

## Acceptance Criteria

- Session cannot close without reconciliation.
- Variance events are recorded and auditable.

## Dependencies

- [TKT-013 POS checkout and returns](./TKT-013-pos-checkout-and-returns.md)
