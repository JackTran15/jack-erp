# Product Scope

## Vision

Build a branch-aware ERP platform that unifies customer data, inventory operations, accounting controls, and retail POS transactions in one system.

## Business Goals

- Keep customer records consistent across branches.
- Track stock accurately across storage, showroom, and location levels.
- Ensure financial records are auditable and reconcilable.
- Enable fast, controlled POS operations for sales and returns.
- Support CSV import/export for inventory operations and integrations.

## In Scope (V1)

- Customer management with required fields:
  - Name
  - Email
  - Address
  - Phone number
- Multi-branch organization with branch-specific access and reporting.
- Organization/branch onboarding:
  - UI page to register new organizations and branches
  - Superadmin approval workflow before activation
- Sales management:
  - Salesman assignment per branch
  - Sales manager assignment per branch
- Inventory:
  - Stock master and stock ledger
  - Storage/showroom/location hierarchy
  - Storage manager assignment per branch
  - Main storage and main showroom under main branch
  - Stock transfer and adjustment
  - CSV import and export
- Accounting:
  - Chart of accounts
  - Payables
  - Receivables
  - Expenses
  - Cash transactions
- POS:
  - Checkout
  - Payment capture
  - Returns
  - Aftersales product exchange/replacement
  - Shift reconciliation
- Configurable document ID generation rules:
  - Prefix/suffix support
  - Timestamp tokens (example: `YYYYMMDD`)
  - Sequence with configurable padding (example: `00001`)
- Generic CRUD management pages and base services for reusable entity operations:
  - invoices
  - providers (stock suppliers)
  - customers
  - orders
  - accounts
  - payables
  - receivables
  - expenses

## Out of Scope (V1)

- Manufacturing and bill of materials.
- HR/payroll.
- Advanced tax engines beyond configurable tax tables.
- Marketplace/e-commerce connectors.

## User Personas

- Owner/Admin: configures branches, accounts, policies, and reports.
- Branch Manager: supervises branch operations and reconciliations.
- Sales Manager: supervises sales team and sales operations for assigned branch.
- Salesman: executes branch-scoped POS sales operations.
- Cashier: performs POS sales, returns, and shift close.
- Storage Admin/Manager: manages branch storage/showroom/location operations.
- Inventory Clerk: manages stock movement and stock corrections.
- Accountant: manages postings, payables, receivables, and period close.

## Non-Functional Requirements

- Auditability: critical actions must be logged with actor, timestamp, branch, and payload diff.
- Security: role-based access control and branch scoping.
- Reliability: idempotent posting and import operations.
- Performance:
  - POS checkout completion target: under 2 seconds for typical cart sizes.
  - Stock lookup target: under 300 ms for common search patterns.
- Availability target: 99.9% monthly uptime.

## Acceptance Criteria

- All modules operate with branch scoping enabled.
- Financial and stock postings are immutable and reversible via controlled workflows.
- CSV import/export supports standard templates and detailed error reporting.
- Core operational reports can be generated per branch and organization-wide.
