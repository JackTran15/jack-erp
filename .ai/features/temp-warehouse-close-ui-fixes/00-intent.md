# Intent — temp-warehouse-close-ui-fixes

## Problem

Backlog item #28 ("Kho tạm") reports two UI defects in the POS fast-stock-transfer
("Kho tạm" / temporary warehouse) flow, `apps/pos-web`:

1. **Scroll:** On `FastStockTransferPage`, the transfer-line table
   (`FastStockTransferTable` → `PosDataTable`, wrapped in a `min-h-0 flex-1
   overflow-auto` div) does not let the user scroll far enough to reach the last
   row when the row count overflows the visible area.
2. **Default close mode:** The "Đóng kho tạm" (close temp warehouse) discrepancy
   dialog (`FastStockTransferDiscrepancyDialog.tsx:60-62`) initializes `closeMode`
   state to `TempWarehouseCloseMode.NET_OFFSET` ("Xuất đi/Trả lại kho tạm"). It
   should default to `TempWarehouseCloseMode.NONE` ("Không xử lý") so the user has
   to actively opt into an offset/transfer action instead of actively opting out
   of one.

## Success signal

1. With enough transfer lines to overflow the table's scroll container, a user
   can scroll all the way down and see the last row fully, unobscured by any
   other element.
2. Opening the discrepancy dialog pre-selects "Không xử lý" (`NONE`) whenever it
   is offered as an option. The existing effect that forces a reselect away from
   `NET_OFFSET` when `netOffsetEligible` turns false still holds (no regression).

## Out of scope

- Any other Kho tạm/temp-warehouse bug not covered by items 1–2 above.
- Changing the close-mode business semantics themselves (`NET_OFFSET` /
  `CREATE_TRANSFERS` / `NONE`) — only which option is pre-selected on open.
- Scroll behavior of other pages/dialogs that also use `PosDataTable`, unless the
  scroll fix's root cause lives in the shared component — in that case those
  other consumers must not regress.

## Constraints

- POS UI strings stay Vietnamese (CLAUDE.md convention).
- Frontend-only in `apps/pos-web`; no API/backend change expected for either
  defect.
- Must not disturb the existing `useEffect` in
  `FastStockTransferDiscrepancyDialog.tsx` (lines 65–72) that resets `closeMode`
  away from `NET_OFFSET` when `netOffsetEligible` becomes false.
