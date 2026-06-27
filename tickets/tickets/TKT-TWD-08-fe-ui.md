# TKT-TWD-08 FE UI: wiring 2 phiên + gate NET_OFFSET + picker location

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Wiring trang Chuyển kho tạm theo 2 phiên: lấy phiên ACTIVE cho cả `w2s` và `s2w`; netted/đối chiếu span 2 phiên; đóng dùng combined close theo `branchId`; chỉ cho chọn `NET_OFFSET` khi **eligible** (2 phiên cùng cặp location). Picker kho (xuất/nhập) per-direction feed `warehouseLocationId`/`showroomLocationId` vào addLine. Tận dụng phần đang sửa dở `WarehouseFilterRow.tsx` + `use-fast-stock-transfer-data.ts`.

## Deliverables

- `apps/pos-web/src/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-data.ts` — gọi `useTempWarehouseActiveSession` cho 2 hướng; suy ra `netOffsetEligible`; close qua `closeBranchSessions(branchId, mode)`; addLine kèm location đã chọn.
- `apps/pos-web/src/components/page-components/FastStockTransfer/FastStockTransferDiscrepancyDialog/FastStockTransferDiscrepancyDialog.tsx` — ẩn/disable option `NET_OFFSET` khi `!netOffsetEligible`.
- `apps/pos-web/src/components/page-components/FastStockTransfer/FastStockTransferToolbar/WarehouseFilterRow/WarehouseFilterRow.tsx` — chọn kho per-direction (đang sửa dở).
- (nếu cần) store workflow: giữ location đã chọn theo direction để truyền vào addLine.

## Acceptance Criteria

- [ ] Trang lấy đúng 2 phiên ACTIVE (w2s/s2w); `sessionId` cũ-đơn không còn là nguồn chân lý.
- [ ] Dialog đối chiếu hiển thị net span 2 phiên; nút Đóng gọi `closeBranchSessions(branchId, mode)`.
- [ ] `netOffsetEligible = cả 2 phiên tồn tại && cùng warehouseLocationId && cùng showroomLocationId` (so trực tiếp 2 object phiên client-side); khi false → option `NET_OFFSET` ẩn/disable, mặc định `CREATE_TRANSFERS`.
- [ ] Case-2 (khác location) + Case-3 (1 phiên): UI chỉ cho `CREATE_TRANSFERS`/`NONE`; submit ra phiếu single.
- [ ] Picker kho xuất/nhập cho mỗi hướng truyền `warehouseLocationId`/`showroomLocationId` vào addLine; bỏ trống → BE fallback resolver.
- [ ] BE vẫn là nguồn chân lý: nếu user lách gửi `NET_OFFSET` khi không eligible → BE trả 400, UI hiện lỗi (không crash).

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` xanh.
- [ ] UI string tiếng Việt; tuân thủ pos-web CLAUDE.md (component `page-components/`, không prefix `Pos`, không `index.ts`).
- [ ] Verify trực quan trên app thật: mở 2 phiên, đóng 3 case; screenshot trước/sau.

## Tech Approach

```ts
// use-fast-stock-transfer-data.ts (lược)
const { data: w2sSession } = useTempWarehouseActiveSession(branchId, TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM);
const { data: s2wSession } = useTempWarehouseActiveSession(branchId, TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE);
const netOffsetEligible = Boolean(w2sSession && s2wSession
  && w2sSession.warehouseLocationId === s2wSession.warehouseLocationId
  && w2sSession.showroomLocationId === s2wSession.showroomLocationId);
// close:
closeSessionMutation.mutate({ branchId, mode });   // mutationFn → closeBranchSessions(branchId, mode)
```

```ts
// FastStockTransferDiscrepancyDialog.tsx
const options = CLOSE_MODE_OPTIONS.filter(o =>
  o.value !== TempWarehouseCloseMode.NET_OFFSET || netOffsetEligible);
```

> Hiện `useFastStockTransferData` đã tách outbound(w2s)/inbound(s2w) line query theo direction — phần lines giữ nguyên; chỉ phần phiên (active/close/eligibility) chuyển sang 2 phiên. Đối chiếu store `fast-stock-transfer-workflow.store` cho `direction`/`filters`.

## Testing Strategy

- Build `tsc`.
- Manual trên app: tạo line 2 hướng (cùng loc → đóng NET_OFFSET; khác loc → NET_OFFSET ẩn, CREATE single; 1 hướng → single). Screenshot từng case.

## Dependencies

- Depends on: TKT-TWD-07
- Blocks: TKT-TWD-09
