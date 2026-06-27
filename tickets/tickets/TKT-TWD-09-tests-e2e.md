# TKT-TWD-09 Tests + E2E + DoD gate

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Phủ test cho mô hình phiên-theo-hướng + đóng gộp: unit cho service, e2e cho full flow (mở 2 phiên → đóng theo 3 case → publish/consume → completion). Đây là cổng DoD của epic.

## Deliverables

- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.spec.ts` — bổ sung case mới.
- `apps/api/test/e2e/...temp-warehouse...e2e-spec.ts` — flow gộp 3 case (mở rộng spec kho tạm sẵn có nếu đã tồn tại).

## Acceptance Criteria

- [ ] Unit: addLine mở phiên theo direction; 2 phiên ACTIVE song song không vi phạm unique; `getActiveSession` theo direction (404 khi thiếu); netted gộp 2 phiên; location client vs fallback.
- [ ] Unit: `closeBranchSessions` —
  - eligible (2 phiên cùng loc) + `NET_OFFSET` → AUTO_BALANCED đúng, đóng cả 2, `processing=NONE`.
  - 2 phiên khác loc + `NET_OFFSET` → `400 TEMP_WAREHOUSE_NET_OFFSET_NOT_ELIGIBLE`; `CREATE_TRANSFERS` → 2 phiếu single đúng location mỗi bên.
  - 1 phiên + `CREATE_TRANSFERS` → 1 phiếu single; `NET_OFFSET` → 400.
  - replay cùng mode → trạng thái hiện tại; khác mode → 409.
- [ ] Unit: `markTransferCompleted` phiên single-direction → COMPLETED sau 1 transfer.
- [ ] E2E: happy (2 phiên cùng loc, NET_OFFSET) + case-2 (khác loc, CREATE single) + case-3 (1 phiên) chạy trên `erp_test`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api test:e2e` xanh (đọc output thật, không chỉ exit message — teardown Kafka có thể treo).
- [ ] `pnpm --filter @erp/api lint` xanh.
- [ ] No Vietnamese trong source backend; không TODO/FIXME ngoài plan.
- [ ] Snapshot openapi đã commit (TWD-06); FE build xanh (TWD-07/08).

## Tech Approach

- Seed: 1 branch có main storage + main showroom (đủ resolver), thêm vài item + stock balance.
- Bảng case đóng gộp = ma trận `{eligible, khác-loc, 1-phiên} × {NET_OFFSET, CREATE_TRANSFERS, NONE}`; assert số AUTO_BALANCED / số event publish / `transferProcessingStatus` / status phiên.
- E2E publish→consume: chờ `processing=COMPLETED` (poll), assert stock transfer tạo đúng source/destination theo location của phiên.

## Testing Strategy

- Unit trước (nhanh), e2e sau cho cross-module/event-driven.

## Dependencies

- Depends on: TKT-TWD-04, TKT-TWD-05, TKT-TWD-08
- Blocks: —
