# API Contracts

## API Standards

- Base path: `/api/v1`
- Authentication: Bearer JWT
- JWTs are accepted only when mapped to active Redis session state.
- Content type: `application/json`
- Pagination: `page`, `pageSize`, `sortBy`, `sortOrder`
- Filtering: module-specific query params
- Idempotency is mandatory for all API requests and responses.
- Error shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Human-readable message",
  "details": []
}
```

## Idempotency Contract (Global Standard)

Request headers (required):

- `X-Request-Id`: unique client request correlation ID.
- `X-Idempotency-Key`: unique key for request replay protection.

Response headers (required):

- `X-Request-Id`: echoed from request.
- `X-Idempotency-Key`: echoed from request.
- `X-Idempotency-Status`: one of:
  - `created` (first successful processing)
  - `replayed` (duplicate request, response replayed)
  - `conflict` (same key with different request fingerprint)

Rules:

- Server stores idempotency record by key + actor + endpoint scope.
- Server response for duplicate request with same fingerprint must be deterministic.
- Reuse of same key with different payload must return idempotency conflict response.
- Idempotency records must have TTL policy and audit traceability.

## Authentication Endpoints

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/session`

## Contract Source of Truth

- Contract types are maintained in `packages/shared-interfaces`.
- Backend imports shared request/response types for DTO mapping.
- Frontend apps import the same types for API client typing.
- Any breaking contract change requires:
  - versioned release note in changelog
  - contract test updates
  - coordinated backend/frontend rollout

## Customer Endpoints

- `GET /customers`
- `POST /customers`
- `GET /customers/:id`
- `PATCH /customers/:id`
- `POST /customers/:id/merge`

## Branch Endpoints

- `GET /branches`
- `POST /branches`
- `PATCH /branches/:id`
- `POST /branches/:id/archive`
- `GET /branches/main`
- `POST /branches/registration-requests`
- `GET /branches/registration-requests`
- `POST /branches/registration-requests/:id/approve`
- `POST /branches/registration-requests/:id/reject`

## Sales Management Endpoints

- `GET /branches/:id/salesmen`
- `POST /branches/:id/salesmen/assign`
- `POST /branches/:id/salesmen/unassign`
- `GET /branches/:id/sales-managers`
- `POST /branches/:id/sales-managers/assign`
- `POST /branches/:id/sales-managers/unassign`

## Organization Onboarding Endpoints

- `POST /organizations/registration-requests`
- `GET /organizations/registration-requests`
- `POST /organizations/registration-requests/:id/approve`
- `POST /organizations/registration-requests/:id/reject`

## Generic CRUD Admin Endpoints

- `GET /admin/entities`
- `GET /admin/entities/:entityKey`
- `GET /admin/entities/:entityKey/records`
- `POST /admin/entities/:entityKey/records`
- `PATCH /admin/entities/:entityKey/records/:id`
- `DELETE /admin/entities/:entityKey/records/:id`

Initial managed `entityKey` targets:

- `invoices`
- `providers`
- `customers`
- `orders`
- `accounts`
- `payables`
- `receivables`
- `expenses`

## Document Numbering Endpoints

- `GET /document-number-rules`
- `POST /document-number-rules`
- `PATCH /document-number-rules/:id`
- `POST /document-number-rules/:id/activate`
- `POST /document-number-rules/:id/deactivate`
- `POST /document-numbers/generate`

## Inventory Endpoints

- `GET /items`
- `POST /items`
- `GET /storages`
- `POST /storages`
- `PATCH /storages/:id`
- `GET /showrooms`
- `POST /showrooms`
- `PATCH /showrooms/:id`
- `POST /branches/:id/storage-managers/assign`
- `POST /branches/:id/storage-managers/unassign`
- `GET /stock/balances`
- `GET /stock/ledger`
- `POST /stock/transfers`
- `POST /stock/transfers/:id/approve`
- `POST /stock/transfers/:id/post`
- `POST /stock/adjustments`
- `POST /stock/adjustments/:id/post`

## CSV Endpoints

- `POST /inventory/imports/items/validate`
- `POST /inventory/imports/items/commit`
- `POST /inventory/imports/opening-balances/validate`
- `POST /inventory/imports/opening-balances/commit`
- `POST /inventory/imports/adjustments/validate`
- `POST /inventory/imports/adjustments/commit`
- `GET /inventory/exports/items`
- `GET /inventory/exports/balances`
- `GET /inventory/exports/ledger`

## Accounting Endpoints

- `GET /accounts`
- `POST /accounts`
- `POST /journals/post`
- `POST /journals/:id/reverse`
- `GET /payables`
- `POST /payables`
- `POST /payables/:id/settle`
- `GET /receivables`
- `POST /receivables`
- `POST /receivables/:id/settle`
- `POST /expenses`
- `POST /cash-movements`

## POS Endpoints

- `POST /pos/sessions/open`
- `POST /pos/sessions/:id/close`
- `POST /pos/sales/checkout`
- `POST /pos/sales/:id/return`
- `POST /pos/sales/:id/exchange`
- `GET /pos/sessions/:id/reconciliation`

## Reporting Endpoints

- `GET /reports/dashboard`
- `GET /reports/sales-summary`
- `GET /reports/inventory-valuation`
- `GET /reports/receivables-aging`
- `GET /reports/payables-aging`
- `GET /reports/cash-reconciliation`

## WebSocket Channels and Events

- Handshake endpoint: `GET /ws` (upgrade)
- Transport implementation: `socket.io`
- Channel scope examples:
  - `org:{organizationId}`
  - `branch:{branchId}`
  - `user:{userId}`
  - `session:{sessionId}`
- Event examples:
  - `inventory.import.status.changed`
  - `pos.checkout.acknowledged`
  - `report.job.completed`
  - `reconciliation.completed`

## Branch Scope Enforcement

- Every branch-scoped endpoint requires `branchId` in request context or query.
- Access beyond user scope returns `403 FORBIDDEN`.

## Contract Test Requirements

- Validate response schema for every endpoint.
- Verify role and branch authorization boundaries.
- Verify idempotency behavior for import and posting endpoints.
