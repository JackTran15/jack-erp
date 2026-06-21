# TKT-STX-03 E2E + tests + DoD (Chuyển kho v2)

## Epic

[EPIC-18062026 Chuyển kho v2](../epics/EPIC-18062026-stock-transfer-v2.md)

## Layer

🟦 Backend e2e + 🟩 FE smoke.

## Summary

Phủ test cross-module cho luồng tạo→post chuyển kho v2: ledger 2 chiều, product-uniform, idempotency, resolve vị trí.

## Deliverables

- `apps/api/test/e2e/stock-transfer-v2.e2e-spec.ts` (chạy trên `erp_test`):
  - tạo phiếu v2 (2 mẫu mã, mỗi mẫu nhiều variant) → DRAFT, vị trí xuất autofill, variant cùng mẫu cùng vị trí.
  - post → stock_balance kho nguồn giảm, kho đích tăng; ledger có 2 movement.
  - product-uniform reject (2 vị trí khác cho 1 mẫu) → 422.
  - idempotency: gửi lại cùng key → REPLAYED, không double-post.
- Unit: `create-stock-transfer-v2.handler.spec.ts`, `post-stock-transfer-v2.handler.spec.ts`.
- FE smoke: render trang, quét barcode thêm dòng, mở dialog nhóm hàng (mock API).

## Acceptance Criteria

- [ ] E2E xanh trên `erp_test`; không rò rỉ chéo tenant/branch.
- [ ] Ledger nguồn/đích đúng; replay không double.
- [ ] Product-uniform enforced ở e2e.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `test:e2e` xanh (đọc output thực, không chỉ exit code — kafkajs teardown có thể treo, xem [[project_e2e_test_db_setup]]).
- [ ] `pnpm --filter @erp/api lint` pass.
- [ ] Không TODO/FIXME ngoài plan.

## Tech Approach

- Mirror cấu trúc e2e goods-issue hiện có; seed org+branch+kho+item+variant qua helper.

## Dependencies

- Requires: TKT-STX-01, TKT-STX-02.
- Blocks: —
