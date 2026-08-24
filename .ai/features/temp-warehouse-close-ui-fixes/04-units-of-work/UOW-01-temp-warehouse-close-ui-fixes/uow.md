---
id: UOW-01
slug: temp-warehouse-close-ui-fixes
title: Kho tạm close-flow UI fixes (scroll + default close mode)
demoable: true
duration: 2h
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: low
status: todo
rollback: revert the two commits; each is a single-file, single-class/single-literal change with no migration or API surface
---

# UOW-01 — Kho tạm close-flow UI fixes

## Demo script
1. Open FastStockTransferPage (Kho tạm) with enough transfer lines to overflow
   the table (seed or filter down to a small viewport if needed).
2. Scroll the transfer-line table to the bottom — the last row is fully
   visible.
3. Click "Đóng kho tạm" for the first time this session. Confirm the "Xử lý
   chênh lệch" radio group opens with "Không xử lý" pre-selected.
4. Cancel, then reopen the dialog — confirm the app still behaves as it did
   before this fix if a different option had been picked (last-selection
   remembered, not reset).

## In scope
- `FastStockTransferPage.tsx` root div height/fill class fix (AC-01, AC-02)
- `FastStockTransferDiscrepancyDialog.tsx` initial `closeMode` default
  (AC-03, AC-04)

## Not in scope
- `ReturnGoodsPage.tsx` / `InvoiceListPage.tsx`, which share the same
  `h-screen` pattern (see A-02) — separate backlog item if confirmed
- Any reset-on-reopen behavior for the discrepancy dialog (see A-03)

## Risks
| Risk | Mitigation |
|---|---|
| Scroll root-cause (A-01) turns out wrong | Contained: only `FastStockTransferPage.tsx` changes; re-diagnose and redo T-01-01 in isolation, no other ticket depends on it |

## Definition of done
- [x] AC-01..AC-04 pass — T-01-01/T-01-02 done, code-review agent PASS (no
      blockers); verified statically, not against a live erp3 dev server (see
      each ticket's Verification note) — recommend a live check before/along
      with the G4 demo
- [x] Demoed and accepted at gate G4 — ready for the demo script above; awaits
      the human `pass G4`
