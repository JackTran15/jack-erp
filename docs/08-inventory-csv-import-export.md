# Inventory CSV Import and Export

## Purpose

Provide controlled bulk import/export for inventory master and stock movement data with strong validation and traceability.

## Supported CSV Operations (V1)

- Item master import
- Stock opening balance import
- Stock adjustment import
- Inventory export (items, balances, movements)

## Template Definitions

## Item Import Template

Columns:

- `itemCode` (required)
- `itemName` (required)
- `uom` (required)
- `category` (optional)
- `isActive` (optional, default true)

## Opening Balance Import Template

Columns:

- `branchCode` (required)
- `storageCode` (required)
- `showroomCode` (optional)
- `locationCode` (required)
- `itemCode` (required)
- `quantity` (required, >= 0)
- `unitCost` (optional)
- `asOfDate` (required)

## Adjustment Import Template

Columns:

- `branchCode` (required)
- `locationCode` (required)
- `itemCode` (required)
- `deltaQuantity` (required, non-zero)
- `reasonCode` (required)
- `referenceNo` (optional)

## Validation Rules

- Required columns must exist and be non-empty.
- Unknown branch/location/item codes fail validation.
- Quantities and costs must be numeric and within policy limits.
- Duplicate keys in one file are either merged or rejected based on import mode.
- `asOfDate` and all timestamps must follow ISO date format.

## Import Modes

- Validate only: parse and return report without writing data.
- Commit: execute validated rows in transactional batches.

## Error Handling

- Errors are reported per row with:
  - row number
  - column
  - error code
  - message
- Failed rows do not block successful rows when partial mode is enabled.
- Full rollback mode is available for strict imports.

## Idempotency

- Import job requires `idempotencyKey`.
- Re-submitting the same key returns existing job result unless forced rerun is allowed.

## Audit Requirements

- Record who uploaded file, when, branch scope, and checksum.
- Keep original file reference and normalized parsed payload.
- Keep final import outcome summary.

## Export Requirements

- Filters:
  - branch
  - item/category
  - date range
  - location hierarchy
- Formats:
  - CSV UTF-8 with header row
- Export metadata:
  - generated time
  - actor
  - filter summary

## Acceptance Criteria

- Templates are documented and downloadable.
- Import supports validate-only and commit modes.
- Error reports are precise enough for user self-correction.
