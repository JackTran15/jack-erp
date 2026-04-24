# TKT-017 Reporting and analytics

## Epic

[EPIC-005 Reporting and Hardening](../epics/EPIC-005-reporting-and-hardening.md)

## Summary

Implement operational and financial reporting endpoints and KPI calculations.

## Deliverables

- Sales, inventory, receivable/payable, and cash reconciliation reports.
- Branch and organization scope filtering.
- KPI computation baseline with definitions.
- Main branch dashboard aggregate charts/tables across all branches.

## Acceptance Criteria

- Report outputs align with posted transactional data.
- Branch access control is enforced for all report endpoints.
- Main branch consolidated dashboard supports branch drill-down.
- Branch admins only see data permitted by assigned branch scopes.

## Dependencies

- [TKT-011 Stock transfer and adjustment](./TKT-011-stock-transfer-and-adjustment.md)
- [TKT-016 Payables/receivables/expenses/cash](./TKT-016-payables-receivables-expenses-cash.md)
- [TKT-019 Redpanda event bus setup](./TKT-019-redpanda-event-bus-setup.md)
- [TKT-020 Redis caching layer setup](./TKT-020-redis-caching-layer-setup.md)
- [TKT-023 WebSocket realtime notification service](./TKT-023-websocket-realtime-notification-service.md)
