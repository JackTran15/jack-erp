# TKT-IFT-06 E2E + test plan + DoD gate

## Epic

[EPIC-08062026 Lập phiếu xuất kho từ Lệnh điều chuyển](../epics/EPIC-08062026-goods-issue-from-transfer.md)

## Layer

🟦 Backend E2E + gate ticket.

## Summary

Chứng minh end-to-end: từ một lệnh điều chuyển `DRAFT`, đường picker + export-with-lines tạo đúng 1 phiếu xuất kho `POSTED` có reference, lệnh nhảy `IN_PROGRESS`, tồn nguồn giảm — idempotent, scoped, không tạo phiếu trùng. Đây là gate đóng epic.

## Deliverables

- `apps/api/test/e2e/goods-issue-from-transfer.e2e-spec.ts` (mới) — chạy trên `erp_test` (`pnpm --filter @erp/api test:e2e`).
- Bổ sung case vào `transfer-order.service.spec.ts` nếu IFT-02 chưa phủ đủ.

## Test cases (E2E)

- [ ] **Issuable scope**: seed 2 chi nhánh; tạo lệnh `DRAFT` ở Store A (source=A) + 1 lệnh source=B + 1 lệnh A đã `IN_PROGRESS` + 1 lệnh A ngoài khoảng ngày. `GET /issuable?from&to` với `X-Branch-Id=A` chỉ trả đúng lệnh A `DRAFT` trong range; có `destinationBranchName`.
- [ ] **Export-from-form happy path**: `POST /:id/export` (X-Branch-Id=A) body `lines` đã sửa → `200`; phiếu xuất kho `POSTED` với `purpose=TRANSFER_OUT`, `referenceType=TRANSFER_ORDER`, `referenceId=<lệnh>`; lệnh `IN_PROGRESS`, `exportGoodsIssueId` set; tồn Store A giảm đúng số đã xuất (ledger).
- [ ] **No double-issue**: không có GoodsIssue thứ hai sinh ra qua `POST /inventory/goods-issues`; export lại lệnh đã `IN_PROGRESS` → `409`.
- [ ] **Idempotency**: lặp `POST /:id/export` cùng `X-Idempotency-Key` → replay (`X-Idempotency-Status: REPLAYED`), chỉ 1 phiếu xuất; cùng key khác body → `409`.
- [ ] **Branch guard**: export với `X-Branch-Id=B` (không phải source) → `403`.
- [ ] **Validation**: body `lines` chứa `itemId` ngoài lệnh → `400`; `quantity<=0` → `400`.
- [ ] **Tenant isolation**: actor org khác không thấy/không export được lệnh org kia (`404`/`403`).

## Acceptance Criteria

- [ ] Tất cả case E2E xanh trên `erp_test`; đọc output thực tế (teardown Kafka treo không tính là fail).
- [ ] Migration check: `migration:show` không có migration mới của epic (epic không đổi schema).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `test:e2e` + `lint` xanh.
- [ ] OpenAPI snapshot đã commit (IFT-03); `migration:generate` không drift.
- [ ] Không Vietnamese trong source backend; không TODO/FIXME ngoài plan.
- [ ] Mô tả verify FE thủ công (3 ảnh tham chiếu) đính kèm PR.

## Dependencies

- Depends on: TKT-IFT-02 (BE), TKT-IFT-05 (FE để verify thủ công).
- Blocks: — (gate đóng epic).
