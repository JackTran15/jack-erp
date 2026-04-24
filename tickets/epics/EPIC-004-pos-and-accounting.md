# EPIC-004 POS and Accounting

## Goal

Ship sales execution and financial posting workflows with reconciliation controls.

## Scope

- POS checkout and returns.
- POS session open/close reconciliation.
- Chart of accounts and journal posting.
- Payables, receivables, expenses, and cash movements.

## Success Metrics

- POS sale and return generate inventory and accounting effects.
- Journal entries remain balanced and immutable.
- Settlement workflows support partial and full settlement.

## Tickets

- [TKT-013 POS checkout and returns](../tickets/TKT-013-pos-checkout-and-returns.md)
- [TKT-014 POS session reconciliation](../tickets/TKT-014-pos-session-reconciliation.md)
- [TKT-015 Accounting COA and journals](../tickets/TKT-015-accounting-coa-and-journals.md)
- [TKT-016 Payables/receivables/expenses/cash](../tickets/TKT-016-payables-receivables-expenses-cash.md)

## Dependencies

- Depends on [EPIC-002 Master Data and Branch](./EPIC-002-master-data-and-branch.md).
- Depends on [EPIC-003 Inventory and CSV](./EPIC-003-inventory-and-csv.md).
