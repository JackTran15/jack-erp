# Testing Strategy

## Objectives

- Prevent regressions across customer, branch, inventory, accounting, and POS modules.
- Validate branch-scoped authorization and immutable posting behavior.
- Ensure API contracts stay stable as implementation evolves.

## Test Pyramid

- Unit tests:
  - Domain services
  - Validation rules
  - Workflow transition guards
- Integration tests:
  - Module + database interactions
  - Ledger posting side effects
  - CSV import pipeline
- End-to-end tests:
  - Critical user journeys from API/UI perspective
  - Role and branch permission boundaries

## Priority Test Scenarios

## Customer

- Create/update with required field validation.
- Duplicate detection and merge behavior.

## Inventory

- Transfer posting writes paired ledger rows.
- Adjustments require reason code and approval policy checks.
- Stock balance reconstruction from ledger matches snapshot table.

## Accounting

- Journal postings are balanced.
- Reversal flow preserves audit chain.
- Payables/receivables partial and full settlement flows.

## POS

- Checkout updates sale, payment, stock, and accounting records.
- Return flow correctly reverses inventory and finance effects.
- Session close reconciliation detects and records variance.

## CSV

- Validate-only mode returns full row-level errors.
- Commit mode handles transactional batches and idempotency keys.

## Contract Testing

- Schema validation for all public endpoints.
- Error code and permission response consistency.
- Backward compatibility for non-breaking response evolution.
- Shared interface drift checks between API implementation and `@erp/shared-interfaces`.

## Test Data Strategy

- Seed baseline organization, branches, roles, items, accounts.
- Use deterministic fixtures for ledger and reconciliation scenarios.
- Isolate branch-specific data sets for authorization tests.

## CI Requirements

- Run unit and integration tests on every PR.
- Run smoke e2e on every PR.
- Run full e2e and performance suite nightly.

## Acceptance Criteria

- Critical workflows have automated tests and pass in CI.
- Authorization boundaries are tested for allow/deny paths.
- Posting and reconciliation invariants are continuously validated.
