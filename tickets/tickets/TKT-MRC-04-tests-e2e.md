# TKT-MRC-04 Unit + E2E cho đối chiếu nhiều tài khoản

## Epic

[EPIC-21072026 Đối chiếu tiền gửi — nhiều tài khoản](../epics/EPIC-21072026-multi-account-deposit-reconcile.md)

## Summary

Chuyển test hiện có sang shape `groups[]` và phủ các nhánh mới: nhiều lô, rollback khi một group hỏng, và các lỗi validate chồng lấn group.

## Deliverables

- `apps/api/src/modules/accounting/deposit-recon/deposit-recon.service.spec.ts`
- `apps/api/test/e2e/deposit-recon-lock.e2e-spec.ts`

## Acceptance Criteria

- [ ] 4 case `reconcile` hiện có chạy lại được với shape `groups`.
- [ ] Mock `buildManager` trả kết quả `getMany` theo từng lần gọi (hiện đang trả cùng một mảng cho mọi query) để test 2 group.
- [ ] Case: 2 group → 2 lô; group lệch gọi `createDraftInternal`, group khớp thì không.
- [ ] Case: `movementId` trùng giữa 2 group → 400.
- [ ] Case: `depositAccountId` trùng giữa 2 group → 400.
- [ ] Case: một group lệch mà thiếu note → 400, không lô nào được ghi.
- [ ] E2E: 3 lời gọi `POST /deposit-recon/reconcile` (UAT-09) đổi sang shape mới; thêm tài khoản tiền gửi thứ hai **trong branchA** (`depositAccountB` hiện thuộc branchB nên `reconcile` lọc theo `actor.branchId` sẽ không thấy) và kiểm 2 group → 2 batch, movements gắn đúng lô của mình.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- deposit-recon` xanh.
- [ ] `pnpm --filter @erp/api test:e2e -- deposit-recon-lock` xanh (DB `erp_test`).

## Manual QA (bug gốc)

1. `/treasury/deposit-reconciliation`, "Số tài khoản" = **Tất cả**, Trạng thái = **Chưa đối chiếu**.
2. Tick 3 dòng thuộc 2 tài khoản → nút **"Đối chiếu"** sáng.
3. Bấm → dialog hiện 2 khối tài khoản, tổng sao kê mặc định = tổng hệ thống từng khối.
4. Xác nhận → kết quả 2 lô `RECONCILED`; đóng → grid reload, 3 dòng rời khỏi filter "Chưa đối chiếu"; đổi filter sang "Đã đối chiếu" thấy đủ 3 dòng + icon khóa.
5. Lặp lại, sửa tổng sao kê **một** tài khoản lệch 10.000 → bắt nhập ghi chú đúng khối đó → lô đó `DISCREPANCY` + `proposalId`, lô kia `RECONCILED`.
6. "Hủy đối chiếu" các dòng vừa đối chiếu → vẫn hoạt động như cũ.
7. Chọn dòng ở trang 1 + trang 2 → tổng "Đã chọn" và dialog tính đủ cả 2 trang.

## Dependencies

- Depends on: TKT-MRC-01, TKT-MRC-03.
