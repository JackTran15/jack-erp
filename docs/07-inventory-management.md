# Inventory Management

## Purpose

Track item quantities and movements with precise location hierarchy and immutable stock ledger records.

## Location Hierarchy

- Branch
  - Storage
    - Showroom
      - Location

Notes:

- Storage is a top-level inventory zone.
- Showroom is customer-facing stock area.
- Location is the atomic stock bucket used in stock balance calculations.
- Main branch must include one default main storage and one default main showroom.
- Each branch can assign one or more storage managers with branch scope.
- Storage admin/manager accounts can access storage management only for assigned branch scope.

## Core Entities

- Item
- Storage
- Showroom
- Location
- StorageManagerAssignment
- StockBalance
- StockLedgerEntry
- StockTransfer
- StockAdjustment

## Inventory Transaction Types

- `purchase_receipt`
- `sale_issue`
- `return_in`
- `exchange_in`
- `exchange_out`
- `transfer_out`
- `transfer_in`
- `adjustment_increase`
- `adjustment_decrease`

## Posting Rules

- Every quantity change must write a `StockLedgerEntry`.
- `StockBalance` is a derived current state per item + location.
- Negative stock policy is configurable:
  - strict mode: block posting below zero.
  - permissive mode: allow and flag for reconciliation.

## Workflows

## Stock Transfer

1. Create transfer document (`draft`).
2. Approve transfer (`approved`).
3. Post transfer:
   - create `transfer_out` ledger at source location
   - create `transfer_in` ledger at destination location
4. Set transfer to `posted`.

## Stock Adjustment

1. Create adjustment with reason code.
2. Require approval if quantity/value threshold exceeded.
3. Post adjustment with increase/decrease ledger entry.
4. Lock posted adjustment from edits.

## Aftersales Exchange

1. Validate original sale reference and exchange eligibility (policy window, item condition, branch policy).
2. Receive returned/defective item into designated location:
   - post `exchange_in` (or route to quarantine/defect location based on policy).
3. Issue replacement item:
   - post `exchange_out` from sellable location.
4. Compute quantity/value differences between returned and replacement items.
5. Hand off financial difference to accounting/POS settlement flow.
6. Lock exchange transaction from direct edits after posting.

## Inventory Counts

- Cycle count and full count modes supported.
- Variance generates controlled stock adjustments.
- Count sessions are branch and location scoped.

## Validation Rules

- Item and location must belong to same organization.
- Source and destination must be different for transfers.
- Quantity must be positive in documents; sign is inferred by transaction type.
- Reason code is mandatory for adjustments.
- Exchange requires reference to original sale or approved aftersales authorization.
- Replacement issue is blocked if replacement stock is unavailable under strict stock policy.
- Main storage/main showroom flags can only be enabled for entities under the main branch.

## Edge Cases

- Transfer posted while destination location is deactivated.
- Concurrent stock movements on same item/location.
- Returns against original sale from a different branch.
- Returned item is defective and cannot be added to sellable stock (must route to quarantine location).
- Exchange with price difference requiring customer top-up or refund.

## Acceptance Criteria

- All stock movements produce immutable ledger records.
- Balances are reconstructible from ledger data.
- Branch/location constraints are enforced consistently.
