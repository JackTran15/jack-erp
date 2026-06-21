# TKT-GRV-03 E2E + tests + DoD (Nhập kho v2)

## Epic

[EPIC-18062026 Nhập kho v2](../epics/EPIC-18062026-goods-receipt-v2.md)

## Layer

🟦 Backend e2e + 🟩 FE smoke.

## Summary

Phủ test luồng tạo→post nhập kho v2: ledger PURCHASE_RECEIPT, công nợ NCC, đối tượng KH, product-uniform, idempotency, autofill theo chi nhánh.

## Deliverables

- `apps/api/test/e2e/goods-receipt-v2.e2e-spec.ts` (`erp_test`):
  - tạo phiếu v2 với đối tượng NCC (CREDIT) → post → stock_balance tăng + `SupplierDebtEntity` ghi nợ 331.
  - tạo phiếu v2 với đối tượng KH (CASH) → post → ledger + tiền mặt.
  - product-uniform reject (2 vị trí/1 mẫu) → 422.
  - autofill: dòng có lịch sử ở kho chi nhánh → vị trí được resolve.
  - idempotency replay → REPLAYED, không double.
- Unit: `create-goods-receipt-v2.handler.spec.ts`, `post-goods-receipt-v2.handler.spec.ts`.
- FE smoke: render trang, mở dialog đối tượng + dialog nhóm hàng (mock API), min-width hiện diện.

## Acceptance Criteria

- [ ] E2E xanh; scope tenant/branch đúng.
- [ ] Công nợ NCC ghi đúng khi CREDIT; tiền mặt khi CASH.
- [ ] Product-uniform + idempotency enforced.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `test:e2e` xanh (đọc output thực — [[project_e2e_test_db_setup]]).
- [ ] `lint` pass; không TODO/FIXME ngoài plan.

## Tech Approach

- Mirror e2e goods-receipt cũ; seed NCC + KH + item/variant + kho mặc định chi nhánh.

## Dependencies

- Requires: TKT-GRV-01, TKT-GRV-02.
- Blocks: —
