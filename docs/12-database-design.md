# Database Design

## Database Strategy

- PostgreSQL single-cluster deployment for V1.
- TypeORM is the ORM layer for entity mapping and migrations.
- UUID primary keys.
- Timestamp columns in UTC.
- Soft-delete only for selected master data.
- Auth session validation state is stored in Redis (not PostgreSQL) for fast token revocation checks.

## Core Tables (Indicative)

## Organization and Access

- `organizations`
- `branches`
- `users`
- `roles`
- `permissions`
- `user_roles`
- `user_branch_assignments`
- `audit_logs`
- `document_number_rules`
- `document_number_counters`

Auth/session notes:

- JWT claims should include user ID, role scope, branch scope, and token ID (`jti`).
- Redis session records should map token/session IDs to active user session metadata and expiry.

## Customer

- `customers`

## Inventory

- `items`
- `storages`
- `showrooms`
- `locations`
- `stock_balances`
- `stock_ledger_entries`
- `stock_transfers`
- `stock_transfer_lines`
- `stock_adjustments`
- `stock_adjustment_lines`
- `inventory_import_jobs`
- `inventory_import_job_rows`

## Accounting

- `accounts`
- `journal_entries`
- `journal_lines`
- `payables`
- `payable_settlements`
- `receivables`
- `receivable_settlements`
- `expenses`
- `cash_accounts`
- `cash_movements`

## POS

- `pos_terminals`
- `pos_sessions`
- `sales`
- `sale_lines`
- `payments`
- `returns`
- `return_lines`

## Referential and Data Constraints

- Foreign key constraints on all parent-child relationships.
- Check constraints:
  - quantities must be numeric and policy-aligned
  - journal entries must balance (enforced by posting procedure/check)
  - status transitions allowed only by workflow engine rules
- Unique constraints:
  - account code per organization
  - item code per organization
  - optional customer email uniqueness policy
  - one active rule per `(organization_id, branch_id, document_type)`
  - generated document number uniqueness per `(organization_id, branch_id, document_type, document_no)`

## Suggested Indexes

- Composite:
  - `(organization_id, branch_id, created_at)` for transactional tables
  - `(organization_id, item_id, location_id)` for stock balances
  - `(organization_id, customer_id)` for sales and receivables
- Search:
  - trigram or lower-case indexes for customer name/email/phone search
- Reporting:
  - date + branch indexes for sales, journals, ledger tables

## Migration Strategy

- Use forward-only migrations.
- Generate and review TypeORM migrations before deployment.
- Separate schema and seed migrations.
- Wrap critical DDL changes in controlled deployment windows.
- Backfill scripts must be idempotent and checkpointed.

TypeORM standards:

- Use explicit entity column names aligned with SQL naming conventions.
- Prefer repository/query builder patterns over raw SQL for standard operations.
- Use raw SQL only for proven performance-critical queries and document rationale.

## Archival and Retention

- Keep financial and audit tables long-term (7 years minimum).
- Consider partitioning high-volume tables:
  - `stock_ledger_entries`
  - `journal_entries`
  - `sales`
  - `audit_logs`

## Acceptance Criteria

- Schema supports all module workflows and immutable ledger behavior.
- Indexes cover critical reads for POS, inventory, and accounting queries.
- Migration process is safe for iterative release cycles.
