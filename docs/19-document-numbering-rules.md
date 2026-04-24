# Document Numbering Rules

## Purpose

Allow administrators to define configurable ID/number generation rules for transactional documents, such as invoices, using combinations of prefix, suffix, timestamp tokens, and sequence padding.

## Supported Pattern Components

- Prefix (static text), example: `HD-`
- Timestamp tokens:
  - `YYYY`
  - `MM`
  - `DD`
  - `YYYYMMDD`
  - `YYYYMM`
- Sequence token with configurable digit length:
  - Example 5 digits: `00001`
  - Example 8 digits: `00000001`
- Suffix (static text), optional

## Example

Invoice format rule:

- Pattern: `HD-{YYYYMMDD}-{SEQ:5}`
- First generated invoice on date `2026-04-24`: `HD-20260424-00001`
- Next invoice same date: `HD-20260424-00002`

## Scope Model

Rules can be configured at:

- Organization level (default)
- Branch level (override)

Sequence reset policy is configurable:

- Daily reset
- Monthly reset
- Yearly reset
- No reset (global increment)

## Core Rule Entity

`DocumentNumberRule` fields:

- `id`
- `organizationId`
- `branchId` (nullable for org-level default)
- `documentType` (example: `invoice`, `receivable`, `payable`, `expense`)
- `prefix`
- `suffix`
- `timestampFormat`
- `sequencePadding`
- `resetPolicy`
- `nextSequence`
- `isActive`
- `createdAt`, `updatedAt`

## Generation Rules

- Rule lookup order:
  1. Branch-level active rule by `documentType`
  2. Organization-level active rule by `documentType`
- Generated number must be unique under scope and document type.
- Sequence increment must be atomic and race-safe.
- Rule updates do not mutate already generated document numbers.
- Regeneration for existing posted documents is not allowed.

## Concurrency and Consistency

- Use transaction + row-level lock (`SELECT ... FOR UPDATE`) or equivalent strategy to reserve sequence values safely.
- On generation failure after reservation, rollback to prevent sequence skips where policy requires strict continuity.
- If strict continuity is not required, skipped numbers must be auditable.

## Validation Rules

- Prefix/suffix allowed charset is configurable (recommended: alphanumeric and `-_/`).
- `sequencePadding` minimum 1, maximum defined by policy (recommended 12).
- Timestamp token must be one of approved formats.
- Only one active rule per `(organizationId, branchId, documentType)` scope.

## Audit and Access Control

- Rule create/update/deactivate requires privileged permission (example: `document-numbering.manage`).
- Number generation events include:
  - rule ID
  - generated value
  - actor/service
  - timestamp
  - source document type and ID

## API Endpoints (Planned)

- `GET /document-number-rules`
- `POST /document-number-rules`
- `PATCH /document-number-rules/:id`
- `POST /document-number-rules/:id/activate`
- `POST /document-number-rules/:id/deactivate`
- `POST /document-numbers/generate`

## Acceptance Criteria

- Invoice and selected financial documents can generate IDs by rule.
- Example format `HD-YYYYMMDD-00001` is supported and validated.
- Sequence generation is concurrency-safe and auditable.
