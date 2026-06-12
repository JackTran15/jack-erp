# TKT-STE-03 Tests (edit service spec) + DoD gate

## Epic

[EPIC-09062026 Sửa phiếu chuyển kho (POSTED)](../epics/EPIC-09062026-stock-transfer-edit.md)

## Layer

🟦 Backend (tests) + cổng nghiệm thu epic.

## Summary

Phủ test cho luồng sửa phiếu POSTED (đảo + ghi lại) và chốt DoD toàn epic.

## Deliverables

- `apps/api/src/modules/inventory/transfer/stock-transfer.service.spec.ts` — bổ sung `describe('update — edit POSTED (reverse + repost)')`:
  - **Happy path**: phiếu POSTED, đổi kho nhập/số lượng → `recordBatchMovements` được gọi với cả leg đảo (`TRANSFER_EDIT_REVERSAL`: TRANSFER_IN về source cũ, TRANSFER_OUT khỏi dest cũ) lẫn leg mới (`TRANSFER`: TRANSFER_OUT source mới, TRANSFER_IN dest mới); lines bị thay; header cập nhật; `documentNumber` giữ nguyên; `publishMovementEvents` gọi sau commit.
  - **Chặn thiếu tồn**: `balanceQb.getOne` trả tồn không đủ cho net-delta âm → `BadRequestException`; `recordBatchMovements` **không** được gọi (hoặc transaction rollback); phiếu gốc không đổi.
  - **CANCELLED → 400**: không record.
  - **DRAFT vẫn no-ledger**: sửa DRAFT chỉ thay dòng, không gọi `recordBatchMovements`.
  - **Cross-org**: `findOrFail` không thấy → `NotFoundException`.
- (Tùy chọn) E2E trên `erp_test`: tạo phiếu kho→kho, PATCH đổi dòng, assert balance phản ánh trạng thái mới + documentNumber giữ nguyên.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/api test -- stock-transfer.service.spec.ts` xanh, phủ các case trên.
- [ ] Không regression: create/post, `cancel` (reverse+void), search v2 handler, goods-issue, transfer-order vẫn pass.

## Definition of Done (epic gate)

- [ ] TKT-STE-01–02 đạt DoD; `pnpm --filter @erp/api test` + `lint` xanh; FE `tsc` xanh.
- [ ] Không Vietnamese trong source BE; không TODO/FIXME ngoài kế hoạch.
- [ ] Không migration / không đổi contract OpenAPI (PATCH /:id + DTO đã có) — không cần `openapi:generate`.
- [ ] Demo: sửa 1 phiếu POSTED (đổi kho nhập + số lượng) → tồn 2 kho điều chỉnh đúng (đảo + ghi lại), Số phiếu chuyển không đổi; thử sửa khi thiếu tồn → bị chặn.

## Tech Approach

- Tái dùng mock harness hiện có trong spec (transferRepo/ledgerService/dataSource/mockManager với `createQueryBuilder`/`update`/`delete`/`save`); `findOne` trả phiếu POSTED (lines cũ) rồi phiếu sau sửa.
- E2E theo lưu ý [[project_e2e_test_db_setup]] nếu thêm.

## Dependencies

- Requires: TKT-STE-01, TKT-STE-02.
- Blocks: —
