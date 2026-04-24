# Generic CRUD Platform

## Purpose

Provide a reusable CRUD foundation for back-office entity management so the system does not duplicate similar list/create/update/delete code for each domain type.

## Target Managed Entities (Initial)

- Invoices
- Providers (stock suppliers)
- Customers
- Orders
- Accounts
- Payables
- Receivables
- Expenses

Additional entities can be onboarded by configuration.

## Design Principles

- Metadata-driven UI and API behavior.
- One base backend CRUD service with extension hooks.
- One generic frontend CRUD page renderer (table + filters + form + detail view).
- Strong RBAC and branch scoping on every operation.
- Preserve specialized workflows by extending, not bypassing, core domain rules.

## Backend Base CRUD Service

Base service contract (`BaseCrudService<TEntity, TCreate, TUpdate>`):

- `list(query, actorContext)`
- `getById(id, actorContext)`
- `create(payload, actorContext)`
- `update(id, payload, actorContext)`
- `remove(id, actorContext)` (soft/hard by entity policy)

Reusable capabilities:

- Standard pagination/filter/sort.
- Branch/organization scope enforcement.
- Audit log integration.
- Common validation pipeline.
- Optimistic concurrency support.
- Cascade handling enabled by default for related child records.

Extension hooks:

- `beforeCreate`, `afterCreate`
- `beforeUpdate`, `afterUpdate`
- `beforeDelete`, `afterDelete`
- `validateBusinessRules`

These hooks allow module-specific behavior (example: payables lifecycle constraints, invoice numbering) while keeping common CRUD mechanics centralized.

## Generic Frontend CRUD Page

Shared page component features:

- Configurable data table columns.
- Search, filter, sort, pagination.
- Form rendering from field schema metadata.
- Per-field validation and visibility rules.
- Role-aware action buttons (create/edit/delete/export/activate).

Entity registration model (example):

- `entityKey`
- endpoint path
- field definitions
- default filters
- permission keys
- create/edit form schema
- view/detail schema

## Entity Metadata Registry

Central registry defines each entity’s CRUD behavior and UI contract.

Suggested metadata fields:

- `entityKey`
- `displayName`
- `apiResource`
- `idField`
- `fields[]`
- `searchableFields[]`
- `filterDefinitions[]`
- `permissions` (`read`, `create`, `update`, `delete`)
- `scopingPolicy` (`organization`, `branch`, `mixed`)
- `deletionPolicy` (`soft`, `hard`, `disabled`)
- `cascadePolicy` (`defaultCascade`, `restrict`, `custom`)
- `cascadeTargets[]` (relations included in cascade operations)

## Domain Guardrails

- Generic CRUD does not replace transactional workflows.
- Entities with workflow state transitions (example: payable posted/settled) must enforce state guards in hook layer.
- Immutable records (example: posted invoices/journals) may disable update/delete operations in metadata and service policy.
- Default cascade behavior must be overridable per entity when legal/compliance or accounting integrity requires restrict mode.
- Cascade execution must be wrapped in one transaction and fully audited (parent + affected children).

## API Pattern

Two compatible approaches are supported:

- Resource-specific endpoints using shared base service internally.
- Optional generic admin endpoints for metadata-driven operations:
  - `GET /admin/entities`
  - `GET /admin/entities/:entityKey`
  - `GET /admin/entities/:entityKey/records`
  - `POST /admin/entities/:entityKey/records`
  - `PATCH /admin/entities/:entityKey/records/:id`
  - `DELETE /admin/entities/:entityKey/records/:id`

## Acceptance Criteria

- At least the initial target entities are managed from one generic CRUD page framework.
- Backend modules reuse base CRUD service patterns instead of duplicated boilerplate.
- RBAC, branch scoping, and audit logging are consistently enforced.
- Specialized domain rules remain intact through extension hooks.
