---
feature: batch-ledger-write
slug: batch-ledger-write
owner: Akenzy
created: 2026-08-12
status: approved         # design already agreed with the human in the planning conversation
---

# Intent — Batch Ledger Write

## Problem

`POST /goods-receipts` (`GoodsReceiptController.create` → `GoodsReceiptService.createAndPost`)
times out and fails on large imports. Reproduced live in production logs
(request `daf45c08…` — 139188ms, request `dca74236…` — 111349ms), both ending in the
generic `BadRequestException("Không thể nhập kho. Vui lòng thử lại.")` thrown by the
catch-all in `goods-receipt.service.ts:162-184`, which swallows the real error.

Root cause traced to `StockLedgerService.recordBatchMovements`
(`stock-ledger.service.ts`): it processes each movement **sequentially**, not as batch SQL.
Confirmed against the actual failing input — the customer's real import file
(`NhapkhauHangHoaNhapKho SHOWROOM.xls`, 1.686 valid data rows, one warehouse
`Showroom BMT` / location `DEFAULT`) — which the goods-receipt import UI collapses into a
single form and a single `POST /goods-receipts` call carrying all 1.686 lines
(`GoodsReceiptFormDialog.tsx:575` `handleApplyDraftImport`).

Two loops account for the cost:
- `stock-ledger.service.ts:264-271` — pre-transaction loop calling
  `pslService.validateAndAssignByLocation()` once per movement (~3-5 queries each).
- `stock-ledger.service.ts:701-733` (`writeBatchMovements`) — in-transaction loop doing
  `manager.save()` + `upsertBalance()` (`findOne` + `update`) once per movement.

At ~5-8 sequential DB round-trips per line × 1.686 lines ≈ 8.000-13.000 round-trips inside
one HTTP request/transaction — consistent with the observed 111-139s failures.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Nhân viên kho (warehouse staff) importing a large goods-receipt Excel file | Waits 100+ seconds, then gets a generic "Không thể nhập kho. Vui lòng thử lại." with no way to tell what went wrong | Import posts in a few seconds; if it does fail, the real cause is not swallowed by unrelated changes in this fix |
| Backend on-call reading server logs | Only sees the generic message + duration; real error is one WARN line away, easy to miss | (unchanged by this fix — logging clarity of `createAndPost`'s catch is out of scope, see below) |

## Success signal

The real file (`NhapkhauHangHoaNhapKho SHOWROOM.xls`, 1.686 lines) posts successfully
through `POST /goods-receipts` in the single-digit seconds, down from the 111-139s
observed, with `stock_balances` and `stock_ledger_entries` ending in the same state the
old sequential code would have produced.

## Out of scope

- Making the write path asynchronous / Kafka-based — rejected in the design discussion:
  breaks the atomicity of the single DB transaction shared with journal/cash/supplier-debt
  posting in `GoodsReceiptService.post()`, and breaks the "POST returns an already-POSTED
  phiếu" contract documented at `goods-receipt.service.ts:150-155`.
- Fixing `createAndPost`'s catch-all swallowing the real error into a generic message
  (`goods-receipt.service.ts:183`) — a real gap, but a separate concern from the
  performance fix; not touched here so the diff stays reviewable.
- An explicit max-line-count guard on goods-receipt imports — the DTO has never capped
  `lines[]`; this fix does not add or remove that cap.
- Any change to the Excel import/validate job flow (`modules/inventory/csv/`) — the input
  file was already confirmed structurally valid; nothing there is broken.

## Constraints

| Kind | Detail |
|---|---|
| Compatibility | `recordBatchMovements(movements, manager?)` signature must not change — called from goods-receipt post, goods-issue, and cancel/reversal paths |
| Data integrity | `stock_ledger_entries` stays one row per input movement (immutable append-only audit log) — only `stock_balances` deltas may be aggregated |
| Transactional | Still exactly one DB transaction per `post()` call, atomic with journal entry / cash movement / supplier-debt posting |
| Reference | Full sequence-diagram design, pseudocode, and complexity comparison already reviewed and approved by the human: https://claude.ai/code/artifact/139e0582-24cb-48ec-ac89-8bf350148de7 |

## Existing surface touched

- Reused components: `StockLedgerService`, `ItemStorageLocationService`, existing
  `StockLedgerEntryEntity` / `StockBalanceEntity` / `ItemStorageLocationEntity` schemas —
  no migration needed, no column changes.
- Adjacent features: goods-receipt (`modules/inventory/goods-receipt/`), goods-issue and
  transfer/cancel flows that also call `recordBatchMovements`.
- Entry points: none new — internal service refactor only, `POST /goods-receipts` contract
  unchanged.
