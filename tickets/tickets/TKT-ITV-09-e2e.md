# TKT-ITV-09 E2E + test plan + DoD gate

## Epic

[EPIC-07062026 Phiếu Điều Chuyển Kho](../epics/EPIC-07062026-inventory-transfer-voucher.md)

## Layer

🟦 Backend E2E + 🟩 gate.

## Summary

Chốt chất lượng bằng E2E round-trip 2 pha trên `erp_test` (qua bảng `transfer_orders` đã mở rộng), phủ migration remap status / tồn âm / cancel-reverse / cross-branch / per-line storage / idempotency, và gate DoD toàn epic.

## Deliverables

- `apps/api/test/e2e/transfer-order.e2e-spec.ts` (cập nhật/mới) — `pnpm --filter @erp/api test:e2e`.

### Kịch bản

1. **Happy path 2 pha**: seed org + 2 branch + storages (mỗi storage có unassigned location) + items + tồn ban đầu Store A. Tạo phiếu (`DRAFT`, LDC) với mỗi dòng có **kho nguồn + kho đích riêng** → export bằng branch nguồn (`IN_PROGRESS`, tồn kho nguồn từng dòng giảm, `exportGoodsIssueId` set, spawn 1 GoodsIssue TRANSFER_OUT) → import bằng branch đích (`COMPLETED`, tồn kho đích từng dòng tăng, `importGoodsReceiptId` set, spawn 1 GoodsReceipt TRANSFER_IN). Assert **không** sinh journal/cash/supplier-debt.
2. **Xuất kho khống**: tồn < số lượng → export vẫn thành công, balance kho nguồn về âm, không exception.
3. **Per-line warehouse**: 2 dòng 2 kho nguồn + 2 kho đích khác nhau → ledger out/in đúng từng location.
4. **Guard trạng thái/branch**: export khi ≠`DRAFT` → 409; export sai branch nguồn → 403; import khi `DRAFT` → 409; import sai branch đích → 403; route cũ `/approve` `/execute` → 404; không đường tự nhảy `COMPLETED`.
5. **Update khoá**: `IN_PROGRESS` sửa lines/branch/storage → 400; sửa notes/attachments → OK.
6. **Cancel-reverse**: cancel `IN_PROGRESS` → GoodsIssue bị cancel, tồn kho nguồn hồi lại, phiếu `CANCELLED`; cancel `DRAFT` → không tác động ledger; cancel `COMPLETED` → 409.
7. **Idempotency**: lặp `POST /:id/export` cùng `X-Idempotency-Key` → replay (không sinh GoodsIssue thứ 2); khác key → 409 do state-guard.
8. **Migration**: hàng `transfer_orders` seed status `EXECUTED`/`APPROVED` trước migration → sau `migration:run` thành `COMPLETED`/`DRAFT`; `migration:revert` đảo lại.

## Acceptance Criteria

- [ ] Tất cả kịch bản xanh, chạy serial (`maxWorkers:1`) — đọc output thực, không tin "suite failed" do Kafka treo teardown (xem `project_e2e_test_db_setup`).
- [ ] Balance kho nguồn/đích sau round-trip khớp kỳ vọng (qua `StockBalanceService`/ledger reconstruct).
- [ ] Không rò chéo tenant.

## Definition of Done (toàn epic)

- [ ] `pnpm --filter @erp/api test` + `test:e2e` + `lint` pass.
- [ ] `pnpm openapi:generate` đã chạy, snapshot + schema committed (TKT-ITV-06); route cũ approve/execute biến mất khỏi schema.
- [ ] `migration:run`/`migration:revert` round-trip sạch (cả nhánh remap status); `synchronize` vẫn false; `migration:generate` không drift.
- [ ] Không Vietnamese trong source backend; FE string tiếng Việt.
- [ ] Không còn `approve`/`markExecuted`/`TransferOrderStatus.APPROVED|EXECUTED` trong toàn repo; không caller chết.
- [ ] Không đụng `StockTransferEntity`/trang "Chuyển kho".
- [ ] FE: route + nav hoạt động; verify trực quan đính kèm PR.

## Tech Approach

Tái dùng helper seed e2e inventory (org/branch/storage/location/item/tồn). Mỗi pha set `X-Branch-Id` đúng branch (nguồn cho export, đích cho import). Kiểm "không sinh journal" bằng query bảng journal/cash sau import = rỗng cho phiếu đó.

## Dependencies

- Depends on: TKT-ITV-04, TKT-ITV-05, TKT-ITV-08.
- Blocks: none (gate cuối).
