# EPIC-003 Inventory and CSV

## Goal

Implement inventory control with immutable stock ledger and CSV import/export workflows.

## Scope

- Storage/showroom/location hierarchy.
- Stock balance and stock ledger.
- Stock transfer and adjustment workflows.
- CSV import/export with validation and idempotency.

## Success Metrics

- All stock movements write ledger entries.
- Balance reconciliation from ledger passes.
- CSV jobs provide row-level error output and audit trail.

## Tickets

- [TKT-009 Inventory location hierarchy](../tickets/TKT-009-inventory-location-hierarchy.md)
- [TKT-010 Stock ledger and balance](../tickets/TKT-010-stock-ledger-and-balance.md)
- [TKT-011 Stock transfer and adjustment](../tickets/TKT-011-stock-transfer-and-adjustment.md)
- [TKT-012 Inventory CSV import/export](../tickets/TKT-012-inventory-csv-import-export.md)

## Dependencies

- Depends on [EPIC-001 Foundation and Monorepo](./EPIC-001-foundation-and-monorepo.md).
- Partially depends on [EPIC-002 Master Data and Branch](./EPIC-002-master-data-and-branch.md) (TKT-009 requires TKT-007 branch/org core for location hierarchy).
