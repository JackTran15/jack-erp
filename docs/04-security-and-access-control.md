# Security and Access Control

## Security Objectives

- Enforce least-privilege access by role and branch scope.
- Protect sensitive operational and financial data.
- Guarantee traceability for critical actions.

## RBAC Model

- Roles are assigned to users with optional branch scope constraints.
- Permissions are action-based, for example:
  - `customer.read`, `customer.write`
  - `inventory.transfer.post`
  - `accounting.journal.post`
  - `pos.checkout.execute`
  - `reporting.financial.read`
  - `reporting.dashboard.branch.read`
  - `reporting.dashboard.consolidated.read`
  - `crud.entity.read`
  - `crud.entity.create`
  - `crud.entity.update`
  - `crud.entity.delete`
  - `org.registration.submit`
  - `org.registration.approve`
  - `branch.registration.submit`
  - `branch.registration.approve`
  - `salesman.assign`
  - `salesmanager.assign`
  - `storage.manager.assign`

## Branch Scoping

- Branch-level roles can access only assigned `branchId` records.
- Organization-level roles can access all branch records within `organizationId`.
- API requests include authenticated user context and allowed branch scope.
- Main branch aggregated report access requires explicit consolidated-report permission.
- Branch admin role must only receive explicitly granted branch scopes.

## Authentication and Session Policy

- JWT access tokens with short TTL and rotating refresh tokens.
- Optional MFA for high-privilege roles.
- Session revocation on credential reset or admin force logout.
- JWT validation requires active session state in Redis (token must map to valid session key).
- Session keys in Redis must include user ID, role scope, branch scope, token ID, and expiry metadata.
- Revoked/expired Redis sessions must immediately invalidate corresponding JWT access.
- Token replay protection should use `jti` tracking and session version checks.

## Role Access Model

- Salesman:
  - Must have user account.
  - Access to POS operations for assigned branch scope.
- Sales manager:
  - Must have user account.
  - Access to POS operations and sales management views for assigned branch scope.
- Storage admin/manager:
  - Must have user account.
  - Access to storage, showroom, and inventory operations for assigned branch scope.
- Branch admin:
  - Access to all permitted modules within explicitly assigned branches.
  - No implicit access to unassigned branches.
- Organization owner:
  - Access to all branches within organization.
  - Access to consolidated/aggregated dashboards and reports across all branches.

## Data Protection

- Encrypt in transit with TLS.
- Encrypt data at rest at infrastructure level.
- Hash and salt credentials using industry-standard password hashing.
- Mask sensitive values in logs.

## Audit Logging

Critical actions must emit immutable audit events with:

- `actorId`
- `organizationId`
- `branchId`
- `entityType` and `entityId`
- `action`
- `beforeSnapshot` and `afterSnapshot` (or diff)
- `timestamp`
- `requestId`

Audit-required actions:

- Customer merge/update
- Generic CRUD create/update/delete actions on managed entities
- Inventory adjustment and transfer posting
- Aftersales exchange posting and approval override
- Journal posting and reversal
- Payable/receivable settlement
- POS void/return and session close
- Role/permission changes
- Organization/branch registration approval or rejection
- Salesman/sales manager/storage manager assignment changes

## Segregation of Duties

- Cashier cannot post manual journal entries.
- Inventory clerk cannot approve their own stock adjustment beyond threshold.
- Accountant cannot change role assignments.
- Admin can configure permissions but cannot bypass immutable ledgers.

## Retention and Compliance

- Audit logs: minimum 7 years retention.
- Financial transactions: minimum 7 years retention.
- Optional PII anonymization on inactive customer data based on policy and legal requirements.

## Security Acceptance Criteria

- Unauthorized branch access attempts are denied and logged.
- Every critical action has an audit event.
- No direct transaction updates bypass posting/reversal workflow.
