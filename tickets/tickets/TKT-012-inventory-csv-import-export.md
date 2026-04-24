# TKT-012 Inventory CSV import/export

## Epic

[EPIC-003 Inventory and CSV](../epics/EPIC-003-inventory-and-csv.md)

## Summary

Deliver CSV import/export jobs for items, opening balances, and adjustments.

## Deliverables

- Validate-only and commit modes.
- Row-level error reporting.
- Idempotency key support and job audit logging.

## Acceptance Criteria

- Bad rows return actionable errors.
- Replayed jobs with same idempotency key are safely handled.

## Dependencies

- [TKT-010 Stock ledger and balance](./TKT-010-stock-ledger-and-balance.md)
- [TKT-023 WebSocket realtime notification service](./TKT-023-websocket-realtime-notification-service.md)
