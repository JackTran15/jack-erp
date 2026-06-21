# TKT-GIV-03 E2E + tests + DoD (Xuất kho v2)

## Epic

[EPIC-18062026 Xuất kho v2](../epics/EPIC-18062026-goods-issue-v2.md)

## Layer

🟦 Backend e2e + 🟩 FE smoke.

## Summary

Phủ test luồng tạo→post xuất kho v2: ledger GOODS_ISSUE âm + giá vốn bình quân, đối tượng NCC/KH, product-uniform, idempotency, autofill vị trí xuất theo chi nhánh.

## Deliverables

- `apps/api/test/e2e/goods-issue-v2.e2e-spec.ts` (`erp_test`):
  - seed tồn (nhập trước) → tạo phiếu xuất v2 → post → stock_balance giảm; ledger GOODS_ISSUE âm; unitPrice = giá vốn bình quân.
  - đối tượng NCC & KH đều tạo được.
  - product-uniform reject (2 vị trí/1 mẫu) → 422.
  - autofill: dòng có tồn → vị trí xuất resolve theo bin.
  - idempotency replay → REPLAYED, không double-post.
- Unit: `create-goods-issue-v2.handler.spec.ts`, `post-goods-issue-v2.handler.spec.ts`.
- FE smoke: render trang, dialog đối tượng + nhóm hàng (mock), min-width.

## Acceptance Criteria

- [ ] E2E xanh; scope tenant/branch đúng.
- [ ] Giá vốn bình quân áp đúng tại post.
- [ ] Product-uniform + idempotency enforced.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `test:e2e` xanh (đọc output thực — [[project_e2e_test_db_setup]]).
- [ ] `lint` pass; không TODO/FIXME ngoài plan.

## Tech Approach

- Mirror e2e goods-issue cũ + e2e goods-receipt-v2; seed tồn qua nhập v2 hoặc ledger helper.

## Dependencies

- Requires: TKT-GIV-01, TKT-GIV-02.
- Blocks: —
