# ERP Documentation

This folder contains the enterprise-ready blueprint for building an ERP system with:

- Customer management
- Multi-branch operations
- Inventory and stock location control
- Accounting
- POS

## Stack Assumptions

- Backend: NestJS
- ORM/Data access: TypeORM
- Frontend: React (web back office + POS)
- Database: PostgreSQL
- Distributed message broker: Redpanda (Kafka-compatible)
- Cache: Redis
- Repository: `pnpm` workspace monorepo

## Documentation Map

- [Product Scope](./01-product-scope.md)
- [Architecture](./02-architecture.md)
- [Domain Model](./03-domain-model.md)
- [Security and Access Control](./04-security-and-access-control.md)
- [Customer Management](./05-customer-management.md)
- [Branch and Organization Model](./06-branch-and-organization-model.md)
- [Inventory Management](./07-inventory-management.md)
- [Inventory CSV Import/Export](./08-inventory-csv-import-export.md)
- [Accounting Module](./09-accounting-module.md)
- [POS Module](./10-pos-module.md)
- [API Contracts](./11-api-contracts.md)
- [Database Design](./12-database-design.md)
- [Workflows and State Machines](./13-workflows-and-state-machines.md)
- [Reporting and Analytics](./14-reporting-and-analytics.md)
- [Testing Strategy](./15-testing-strategy.md)
- [Deployment and Operations](./16-deployment-and-operations.md)
- [Rollout Plan](./17-rollout-plan.md)
- [Monorepo Workspace and Shared Interfaces](./18-monorepo-workspace-and-shared-interfaces.md)
- [Document Numbering Rules](./19-document-numbering-rules.md)
- [Realtime WebSocket Service](./20-realtime-websocket-service.md)
- [Generic CRUD Platform](./21-generic-crud-platform.md)

### Entity Schema Reference

Comprehensive per-field documentation of all 45 TypeORM entities, designed for
code-generation agents and developers:

- **[Entity Docs Index](./entities/README.md)** — overview, ER diagram, conventions
- [Auth Entities](./entities/01-auth.md) — User, Role, Permission, UserRole, RolePermission
- [Organization & Branch](./entities/02-organization-branch.md) — Organization, Branch, UserBranchAssignment, RegistrationRequest
- [Customer](./entities/03-customer.md) — Customer (with merge workflow)
- [Sales Hierarchy](./entities/04-sales-hierarchy.md) — SalesmanAssignment, SalesManagerAssignment
- [Document Numbering](./entities/05-document-numbering.md) — DocumentNumberRule, DocumentNumberCounter
- [Inventory](./entities/06-inventory.md) — Item, Storage, Showroom, Location, StockBalance, StockLedgerEntry, StockTransfer, StockAdjustment, ImportJob
- [Accounting](./entities/07-accounting.md) — Account, JournalEntry, JournalLine, CashAccount, CashMovement, Payable, Receivable, Expense
- [POS](./entities/08-pos.md) — PosSession, Sale, SaleLine, Payment, Return, ReturnLine, SessionReconciliation

## Documentation Conventions

- `branchId` is mandatory for branch-scoped operational data.
- Business transactions are immutable after posting; corrections are done by reversal entries.
- Date/time is stored in UTC.
- Monetary amounts are stored as `NUMERIC(18,2)` in PostgreSQL.
- IDs are UUID v4 unless stated otherwise.
- Shared TypeScript contracts live in workspace packages and are imported by both backend and frontend apps.

## Glossary

- Organization: top-level company entity.
- Branch: operational business unit under one organization.
- Storage: high-level physical stock area.
- Showroom: sellable display area under a storage or branch.
- Location: lowest-level stock bin/shelf/rack.
- Stock Ledger: immutable record of inventory quantity changes.
- Accounting Journal: immutable debit/credit posting records.
