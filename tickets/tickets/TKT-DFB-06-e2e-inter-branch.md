# TKT-DFB-06 E2E — UAT-07 chuyển liên chi nhánh

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Chuyển tiền liên chi nhánh (GĐ4)](../epics/EPIC-15072026-deposit-fund-inter-branch.md)

## Summary

E2E tự động (chạy trên DB `erp_test`) chứng minh **UAT-07** và tính bảo toàn tổng quỹ của mô hình 2 chân: CN A chuyển 10.000.000 cho CN B, B **chưa** xác nhận → quỹ A **−10tr**, quỹ B **không đổi**, báo cáo "Tiền đang chuyển" hiện **10tr**; sau khi B xác nhận → quỹ B **+10tr**, in-transit **clear**; và **tổng số dư toàn hệ thống (Σ số dư tài khoản + tiền đang chuyển) không đổi** ở cả 3 mốc (BR-TRF-01/02/03/05, R5). Đây là DoD gate của cả epic GĐ4.

## Deliverables

- `apps/api/test/e2e/deposit-inter-branch.e2e-spec.ts` — kịch bản UAT-07 đầy đủ (seed 2 chi nhánh + deposit account mỗi bên → create → assert giữa chừng → confirm → assert cuối; thêm case cancel + case guard).
- (nếu cần) helper seed dưới `apps/api/test/e2e/setup/` để tạo org + 2 branch + deposit account + user có quyền transfer/confirm (tái dùng helper GĐ1-GĐ2 nếu đã có).

## Acceptance Criteria (map UAT/BR)

- [ ] **UAT-07 (giữa chừng)**: sau `POST /deposit-transfers` {toBranch=B, amount=10tr} bằng actor CN A:
  - `deposit_accounts(A).balance` giảm đúng 10tr (BR-TRF-01);
  - `deposit_accounts(B).balance` **không đổi**;
  - `GET /deposit-transfers/in-transit` trả 1 dòng, `total = 10tr` (BR-TRF-02, R5);
  - transfer `status = DANG_CHUYEN`; JE chân A = `DR 113 / CR 112(A)`, **không** có dòng doanh thu/chi phí (BR-TRF-05);
  - `GET /deposit/dashboard`: `grandTotal` = Σ số dư + in-transit = **bằng** giá trị trước khi chuyển.
- [ ] **UAT-07 (sau xác nhận)**: sau `POST /deposit-transfers/:id/confirm` bằng actor CN B:
  - `deposit_accounts(B).balance` tăng đúng 10tr;
  - in-transit report **rỗng** (`total = 0`);
  - transfer `status = HOAN_TAT`, `to_receipt_id` set, `confirmed_by/at` set; chân A movement `transfer_status = HOAN_TAT`;
  - JE chân B = `DR 112(B) / CR 113`; TK 113 net = 0;
  - `grandTotal` dashboard **vẫn** bằng giá trị ban đầu (bất biến qua cả 3 mốc).
- [ ] **BR-TRF-03**: gọi `confirm` lần 2 hoặc `cancel` sau khi `HOAN_TAT` → `409`.
- [ ] **BR-TRF-01 guard**: chuyển số tiền > số dư A (account `allow_negative=false`) → `400`, message nêu số dư khả dụng; không tạo header, không giảm quỹ.
- [ ] **cancel path**: transfer mới (DANG_CHUYEN) → `POST /:id/cancel` bằng CN A → quỹ A khôi phục, in-transit clear, `status = DA_HUY`; TK 113 net = 0.
- [ ] **BR-PERM-01 / UAT-13**: actor chỉ được gán CN A gọi `confirm` (đích B) → `403`; actor CN khác không gán A/B gọi in-transit report → không thấy transfer này.
- [ ] **Idempotency (D2)**: replay `confirm` cùng `X-Idempotency-Key` (hoặc gọi lặp) → chỉ **1** movement chân B (unique `deposit_movements(source, source_ref_id, source_ref_line_id)` chặn dòng thứ 2); số dư B không cộng 2 lần.

## Definition of Done

- [ ] `pnpm --filter @erp/api test:e2e` xanh (kiểm tra output thực tế, không chỉ exit message — teardown Kafka có thể treo gây "suite failed" giả).
- [ ] Spec phủ: happy path 3 mốc + cancel + guard 409 + guard số dư 400 + permission 403 + idempotent replay.
- [ ] Không đổi schema; `synchronize` giữ `false`; migration đã apply qua global-setup.
- [ ] Không có tiếng Việt trong backend source (test identifiers/strings English).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Skeleton (Nest e2e app, supertest — theo `cash-vouchers` e2e TKT-CV-12):

```ts
describe('Deposit inter-branch transfer (UAT-07)', () => {
  let app: INestApplication;
  let ctx: SeededOrg; // org, branchA, branchB, acctA, acctB, userA(transfer), userB(confirm)

  beforeAll(async () => { app = await bootstrapE2E(); ctx = await seedTwoBranchDeposit(app); });
  afterAll(async () => { await app.close(); });

  it('A −10tr, B unchanged, in-transit shows 10tr, grand total invariant', async () => {
    const before = await getDashboard(app, ctx.userA);              // snapshot grandTotal
    const { body: t } = await http(app, ctx.userA)
      .post('/deposit-transfers').send({ toBranchId: ctx.branchB.id, toAccountId: ctx.acctB.id, amount: '10000000' })
      .expect(201);
    expect(await balance(app, ctx.acctA)).toBe(sub(before.acctA, '10000000')); // BR-TRF-01
    expect(await balance(app, ctx.acctB)).toBe(before.acctB);                   // B unchanged
    const it = await getInTransit(app, ctx.userA);
    expect(it.total).toBe('10000000');                                          // BR-TRF-02 / R5
    expect(t.status).toBe('DANG_CHUYEN');
    expect((await getDashboard(app, ctx.userA)).grandTotal).toBe(before.grandTotal); // invariant
    await assertJournalNoPnl(app, t.fromPaymentId);                             // BR-TRF-05

    // confirm at B
    await http(app, ctx.userB).post(`/deposit-transfers/${t.id}/confirm`).send({}).expect(200);
    expect(await balance(app, ctx.acctB)).toBe(add(before.acctB, '10000000'));  // B +10tr
    expect((await getInTransit(app, ctx.userB)).total).toBe('0');               // clears
    expect((await getDashboard(app, ctx.userA)).grandTotal).toBe(before.grandTotal); // still invariant

    // BR-TRF-03: A cannot cancel after B confirmed
    await http(app, ctx.userA).post(`/deposit-transfers/${t.id}/cancel`).send({ reason: 'x' }).expect(409);
  });

  it('insufficient balance at A → 400, no header, no debit', async () => { /* amount > balance */ });
  it('cancel while DANG_CHUYEN restores A, clears in-transit', async () => { /* ... */ });
  it('confirm by non-destination branch → 403 (BR-PERM-01)', async () => { /* ... */ });
  it('replay confirm → single leg-B movement (D2 idempotent)', async () => { /* ... */ });
});
```

**Reuse**: bootstrap/seed helper của e2e cash-vouchers (`test/e2e/setup/*`, global-setup tạo `erp_test` + apply migrations), pattern assert balance/JE. `assertJournalNoPnl` đọc `journal_entries` của `fromPaymentId`/`toReceiptId`, assert không có dòng account 5xx/6xx/7xx/8xx.

## Testing Strategy

- E2E `pnpm --filter @erp/api test:e2e` — map: happy path → UAT-07; guard số dư → UAT-04 pattern; permission → UAT-13; idempotent → UAT-03 pattern (áp cho transfer leg).
- Chạy serial (`maxWorkers: 1`, `forceExit: true`); đọc output thực tế vì consumer Kafka có thể để handle mở.

## Dependencies

- Depends on: TKT-DFB-02 (service), TKT-DFB-03 (in-transit/dashboard endpoints), TKT-DFB-01 (schema/COA 113). FE (DFB-05) không phải tiền đề của E2E backend.
- Blocks: — (ticket cuối; DoD gate của epic GĐ4).
