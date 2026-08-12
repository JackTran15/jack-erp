---
feature: batch-ledger-write
stories: 1
acceptance_criteria: 7
---

# Requirements — Batch Ledger Write

## US-01 — Post a large goods-receipt import without timing out

As nhân viên kho importing a goods-receipt Excel file with hundreds to thousands of lines,
I want the import to post in a few seconds instead of 100+ seconds
so that I don't hit the generic "Không thể nhập kho. Vui lòng thử lại." failure.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Large batch posts correctly and fast
```gherkin
Given a validated goods-receipt import with 1.686 valid rows (Showroom BMT / DEFAULT),
  the real file NhapkhauHangHoaNhapKho SHOWROOM.xls
When the draft is applied and POST /goods-receipts is submitted
Then the receipt is created and reaches status POSTED
And it completes in single-digit seconds, well under the previously observed 111-139s
And every line's stock_ledger_entries row and resulting stock_balances quantity match
  what the old sequential code would have produced
```

**AC-02** — Duplicate SKU + location within one batch aggregates correctly
```gherkin
Given the import contains two rows for the same item at the same location
  (real example: SKU TX3150-D, Showroom BMT / DEFAULT, quantity 1 each)
When the batch is posted
Then stock_balances for that (item, location) increases by the summed delta (+2)
And stock_ledger_entries contains two separate rows, one per input line, not aggregated
```

**AC-03** — Negative balance still produces a warning
```gherkin
Given a movement in the batch would drive a location's balance below zero
When the bulk stock_balances UPSERT commits
Then a warning is logged identifying the affected item, location, and resulting quantity
And exactly one warning pass runs per batch, not one query per line
```

**AC-04** — Inactive storage still blocks the whole batch
```gherkin
Given one or more locations in the batch belong to a storage with is_active = false
When recordBatchMovements is called
Then the whole batch is rejected with the existing
  "Không thể thao tác trên kho đã ngừng hoạt động: ..." BadRequestException, unchanged
```

**AC-05** — "Chưa xếp" (unassigned) location skips shelf assignment
```gherkin
Given a movement targets the virtual "Chưa xếp" (isUnassigned) location
When batch shelf-assignment runs
Then no item_storage_locations row is created or updated for that item from this movement
```

**AC-06** — Existing preferred-shelf mapping is left untouched when still valid
```gherkin
Given an item already has a valid item_storage_locations mapping for a storage
When a new batch posts a movement at a different, still-valid location in that same storage
Then the existing mapping row is not modified and no duplicate row is created
```

**AC-07** — Public contract and transaction guarantees unchanged
```gherkin
Given any existing caller of StockLedgerService.recordBatchMovements
  (goods-receipt post, goods-issue, cancel/reversal)
When it invokes recordBatchMovements(movements, manager?)
Then the method signature, return type, and single-transaction atomicity are identical
  to before this change
And recordMovement (the single-movement path) is untouched
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Performance | 1.686-line goods-receipt posts in single-digit seconds, not 111-139s | T-01-03 |
| Scalability | Total DB round-trips for the write path are O(1) per batch (~6-7 queries), not O(n) | T-01-01, T-01-02 |
| Compatibility | No caller of `recordBatchMovements` needs code changes | T-01-01, T-01-02 |
