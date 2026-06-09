# TKT-STL-05 Tests (handler + reverse spec) + DoD gate

## Epic

[EPIC-09062026 Danh sách Chuyển kho theo mẫu mShopKeeper](../epics/EPIC-09062026-stock-transfer-list-v2.md)

## Layer

🟦 Backend (tests) + cổng nghiệm thu epic.

## Summary

Phủ test cho v2 search handler và luồng Xóa (đảo bút toán + void), chốt DoD toàn epic.

## Deliverables

- `apps/api/src/modules/inventory/transfer/queries/search-stock-transfers-v2.handler.spec.ts` — mirror `search-goods-issues-v2.handler.spec.ts`:
  - Scope `organizationId` + `branchId`; ẩn `status = CANCELLED`.
  - Filter từng cột: date-range `transferredAt`, `documentNumber` contains, `transporter` contains, `notes` contains, `totalAmount ≤ X` (SUM subquery).
  - Row trả `transporter` inline, `totalAmount` đúng ∑ line_value, `lines` đầy đủ; phân trang/envelope đúng.
- `apps/api/src/modules/inventory/transfer/stock-transfer.service.spec.ts` — bổ sung `describe('cancel — reverse & void')`:
  - POSTED → đảo 2 chân (TRANSFER_IN về source, TRANSFER_OUT khỏi dest), status = CANCELLED, 1 transaction, publish events.
  - Gọi lần 2 (đã CANCELLED) → `BadRequestException`, không đảo thêm.
  - DRAFT → void thẳng (hành vi cũ giữ nguyên).
  - Cross-org → `NotFoundException`.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/api test -- search-stock-transfers-v2.handler.spec.ts` + `stock-transfer.service.spec.ts` xanh.
- [ ] Không regression: goods-issue v2, transfer-order, form create/post specs cũ vẫn pass.

## Definition of Done (epic gate)

- [ ] TKT-STL-01–04 đạt DoD; `pnpm --filter @erp/api test` + `lint` xanh; FE `tsc` xanh.
- [ ] `pnpm openapi:generate` đã chạy, snapshot + `schema.ts` committed.
- [ ] Không Vietnamese trong source BE; không TODO/FIXME ngoài kế hoạch.
- [ ] Demo: danh sách lọc theo cột + footer + panel Chi tiết khớp Image #8; Nhân bản tạo phiếu mới; Xóa đảo tồn + ẩn phiếu.

## Tech Approach

- Mock `QueryBus`/repos theo pattern `search-goods-issues-v2.handler.spec.ts`.
- Reverse spec tái dùng mock manager (`createQueryBuilder`/`update`) + `recordBatchMovements`/`publishMovementEvents` như spec hiện có.
- E2E ([[project_e2e_test_db_setup]]) tùy chọn nếu cần kiểm tra đảo tồn end-to-end trên `erp_test`.

## Dependencies

- Requires: TKT-STL-01, TKT-STL-02, TKT-STL-04.
- Blocks: —
