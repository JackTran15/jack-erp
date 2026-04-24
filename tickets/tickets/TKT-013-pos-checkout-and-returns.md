# TKT-013 POS checkout and returns

## Epic

[EPIC-004 POS and Accounting](../epics/EPIC-004-pos-and-accounting.md)

## Summary

Implement POS checkout, return, and aftersales exchange flows with inventory and finance side effects.

## Deliverables

- Checkout endpoint and sale records.
- Return endpoint with original sale linking.
- Exchange endpoint with original sale linking and eligibility checks.
- Stock and accounting integration hooks.

## Acceptance Criteria

- Sale updates stock and posts accounting entries.
- Return reverses inventory and finance impacts correctly.
- Exchange performs paired stock in/out and correctly settles price differences.

## Dependencies

- [TKT-008 Customer module](./TKT-008-customer-module.md)
- [TKT-010 Stock ledger and balance](./TKT-010-stock-ledger-and-balance.md)
- [TKT-022 Document numbering rule engine](./TKT-022-document-numbering-rule-engine.md)
- [TKT-023 WebSocket realtime notification service](./TKT-023-websocket-realtime-notification-service.md)
- [TKT-024 Generic CRUD platform](./TKT-024-generic-crud-platform.md)
