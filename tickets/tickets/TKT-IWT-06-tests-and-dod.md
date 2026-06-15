# TKT-IWT-06 Tests (service spec + E2E) + DoD gate

## Epic

[EPIC-09062026 Chuyển kho giữa các kho trong cùng chi nhánh](../epics/EPIC-09062026-inter-warehouse-transfer.md)

## Layer

🟦 Backend (tests) + cổng nghiệm thu epic.

## Summary

Phủ test cho luồng kho→kho và chốt Definition of Done toàn epic.

## Deliverables

- `apps/api/src/modules/inventory/transfer/stock-transfer.service.spec.ts` — bổ sung case:
  - Happy path kho→kho cùng chi nhánh: 2 dòng khác kho → ledger có đủ `TRANSFER_OUT`/`TRANSFER_IN` đúng location; balance xuất giảm, nhập tăng.
  - Storage thuộc chi nhánh khác → `BadRequestException` (không ghi sổ).
  - Bỏ trống vị trí → resolve về location `is_unassigned`; kho thiếu vị trí mặc định → 400.
  - `unitPrice` rỗng → lấy snapshot cost; `lineValue = unitPrice × quantity`.
  - Tồn không đủ tại vị trí xuất → 400 (khóa bi quan), rollback nguyên tử.
  - `transporterUserId` không thuộc org → 400; phiếu hợp lệ lưu được `attachmentIds`/`transferredAt`.
  - Backfill/back-compat: phiếu chuyển nội kho (Kho xuất = Kho nhập, khác vị trí) vẫn hoạt động.
- E2E `apps/api/test/e2e/...` (nếu có suite transfer): tạo phiếu kho→kho qua HTTP trên `erp_test`, assert response inline + balance.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/api test -- stock-transfer.service.spec.ts` xanh, phủ mọi case trên.
- [ ] `pnpm --filter @erp/api test:e2e` (nếu thêm e2e) xanh trên `erp_test`.
- [ ] Không regression: test cũ của `transfer`, `goods-issue`, `adjustment`, `transfer-order` vẫn pass.

## Definition of Done (epic gate)

- [ ] Toàn bộ TKT-IWT-01–05 đạt DoD; `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Migration up/down sạch; `migration:generate` không drift.
- [ ] `pnpm openapi:generate` đã chạy, snapshot + schema.ts committed.
- [ ] Không Vietnamese trong source BE; không TODO/FIXME ngoài kế hoạch.
- [ ] Demo: tạo phiếu chuyển kho→kho cùng chi nhánh trên UID, kiểm tra báo cáo tồn 2 kho thay đổi đúng.

## Tech Approach

- Seed: 1 org, 1 branch, 2 storages (mỗi kho có location `is_unassigned`), 1 item có tồn ở kho xuất; assert qua `StockBalanceService`.
- Theo lưu ý e2e ([[project_e2e_test_db_setup]]): env DB tường minh + pre-seed `erp_test`; teardown Kafka treo có thể giả "suite failed" — đọc output thật.

## Dependencies

- Requires: TKT-IWT-02 (logic), TKT-IWT-05 (UI để demo).
- Blocks: —
