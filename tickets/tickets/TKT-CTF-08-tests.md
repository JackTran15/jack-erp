# TKT-CTF-08 Test plan — unit, e2e, QA thủ công

## Epic

[EPIC-21072026 Phiếu chi tiền mặt — chuyển thành tiền gửi & chuyển đến cửa hàng khác](../epics/EPIC-21072026-cash-transfer-vouchers.md)

## Summary

Cổng chất lượng cuối của epic: unit test cho `CashTransferService`, e2e cho vòng đời 2 chân qua HTTP thật, và checklist click-through trên trình duyệt cho cả 3 mục đích chi.

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/cash-transfer/cash-transfer.service.spec.ts` (đã tạo ở CTF-02, bổ sung ca còn thiếu).
- `apps/api/test/e2e/cash-transfer.e2e-spec.ts` (mới).
- Kết quả QA thủ công (ảnh chụp + truy vấn DB) ghi vào PR description.

## Acceptance Criteria

- [ ] Unit test phủ đủ danh sách ở [TKT-CTF-02](./TKT-CTF-02-cash-transfer-service.md) mục Testing Strategy.
- [ ] E2E chạy được trên DB `erp_test` với 2 chi nhánh thật, đi qua HTTP (guard + permission + `IdempotencyInterceptor` đều thực thi).
- [ ] E2E phủ: tạo (CASH), xác nhận, số dư 2 quỹ đúng; tạo (DEPOSIT), xác nhận, `deposit_movements.transfer_status = HOAN_TAT`; huỷ; 403 sai chi nhánh; 409 xác nhận 2 lần; replay idempotency.
- [ ] Không có test nào bị `skip`/`only` sót lại.
- [ ] Nếu e2e không chạy được vì môi trường, ghi rõ **vì sao** trong PR — không được báo pass khống.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` toàn bộ pass (không chỉ file mới).
- [ ] `pnpm --filter @erp/api test:e2e -- cash-transfer` pass. Lưu ý: e2e chạy `maxWorkers: 1` + `forceExit: true`, consumer kafkajs để hở handle nên teardown treo có thể giả dạng "suite failed" — đọc output test thật, đừng chỉ nhìn exit message.
- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Checklist QA thủ công bên dưới hoàn thành đủ 9 bước.

## Tech Approach

E2E setup: 2 chi nhánh cùng org, mỗi chi nhánh có quỹ tiền mặt; chi nhánh B thêm 1 tài khoản tiền gửi ACTIVE. Đổi chi nhánh bằng header `X-Branch-Id`, không cần login lại.

```ts
// Chuyển chiều CASH
const created = await request(app.getHttpServer())
  .post('/cash-transfers')
  .set('X-Branch-Id', branchA.id)
  .send({ toBranchId: branchB.id, toFundKind: 'CASH', amount: 500000 })
  .expect(201);

// A không được xác nhận
await request(app.getHttpServer())
  .post(`/cash-transfers/${created.body.id}/confirm`)
  .set('X-Branch-Id', branchA.id)
  .expect(403);

// B xác nhận
await request(app.getHttpServer())
  .post(`/cash-transfers/${created.body.id}/confirm`)
  .set('X-Branch-Id', branchB.id)
  .expect(201);

// Xác nhận lần 2 → 409
await request(...).expect(409);
```

## Testing Strategy — checklist QA thủ công

1. `make dev-api` + `make dev-backoffice`, đăng nhập, chọn **CH A**.
2. Thu chi tiền mặt → Thêm mới → Phiếu chi → Mục đích **Chuyển tiền mặt thành tiền gửi**, chọn Tài khoản thu, nhập tiền, **giữ tick** → Lưu.
   Kiểm: `cash_payments` +1, `bank_receipts` +1, quỹ tiền mặt giảm, số dư tiền gửi tăng.
3. Lặp lại nhưng **bỏ tick** → chỉ `cash_payments` +1, số dư tiền gửi không đổi, dư TK 113 tăng.
4. Mục đích **Chuyển tiền đến cửa hàng khác** → Cửa hàng nhận = CH B, Hình thức nhận = **Thu tiền mặt** → Lưu.
   Kiểm: `cash_transfer` status `DANG_CHUYEN`, quỹ CH A giảm, quỹ CH B **chưa** đổi.
5. Đổi chi nhánh sang **CH B** → `/treasury/cash-transfers` → Xác nhận → quỹ CH B tăng, status `HOAN_TAT`, TK 113 về 0.
6. Lặp bước 4 với **Thu tiền gửi** + chọn Tài khoản nhận → xác nhận ở CH B → `bank_receipts` purpose `INTER_BRANCH_IN` sinh ra, `deposit_movements.transfer_status = HOAN_TAT`.
7. Tạo transfer mới rồi **Huỷ** ở CH A → `cash_payments` bị đảo, quỹ CH A hoàn nguyên, status `DA_HUY`.
8. Kiểm quyền: user thiếu `accounting.cash_transfer.confirm` → 403; CH A bấm Xác nhận → 403 "Only the destination branch"; CH B bấm Huỷ → 403.
9. Idempotency: gửi lại `POST /cash-transfers` cùng `X-Idempotency-Key` + cùng body → `X-Idempotency-Status: REPLAYED`, không sinh chứng từ thứ 2; cùng key + body khác → 409.

## Dependencies

- Depends on: [TKT-CTF-06](./TKT-CTF-06-payment-dialog-submodes.md), [TKT-CTF-07](./TKT-CTF-07-cash-transfer-page.md)
- Blocks: —
