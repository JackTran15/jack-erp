# TKT-DFS-09 E2E chi tiêu (UAT-04/05/06/08)

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Giai đoạn 2: Chi tiêu](../epics/EPIC-15072026-deposit-fund-spending.md)

## Summary

E2E backend (`test:e2e`, DB `erp_test`) chứng minh 4 kịch bản UAT trọng yếu của GĐ2 end-to-end qua HTTP: chặn chi vượt
số dư (UAT-04), race 2 phiếu chi đồng thời chỉ 1 thành công (UAT-05, NFR-03), swap tiền gửi ↔ tiền mặt atomic đổi 2 quỹ
(UAT-06), và trả NCC bằng tiền gửi giảm cả quỹ lẫn công nợ (UAT-08). Đây là verification gate cuối của epic.

## Deliverables

- `apps/api/test/e2e/deposit-fund-spending.e2e-spec.ts` — suite E2E mới, seed org + branch + user + deposit account + cash account + NCC/payable, chạy qua Supertest.
- (Nếu cần) helper seed trong `apps/api/test/e2e/setup/` — reuse pattern seed hiện có; không tạo helper mới nếu đã có.

## Acceptance Criteria (map UAT)

- [ ] **UAT-04** — số dư tài khoản gửi = 1.000.000, tạo + POST Phiếu chi 1.500.000 → HTTP 400, body chứa message số dư khả dụng; `GET /deposit-accounts/:id` balance **vẫn** 1.000.000 (không đổi). (BR-CHI-01)
- [ ] **UAT-05** — số dư = 1.000.000, bắn **2** request `POST /bank-payments/:id/post` (2 phiếu 800.000) **đồng thời** (`Promise.all`) → đúng **1** phiếu POSTED, **1** phiếu 400; balance cuối = 200.000. (NFR-03 race, `SELECT FOR UPDATE`)
- [ ] **UAT-06** — số dư gửi ≥ 5.000.000, `POST /fund-swaps {DEPOSIT_TO_CASH, amount: 5.000.000}` → response 2 chân; `deposit_accounts.balance −5tr` **và** `cash_accounts.balance +5tr`; tổng (gửi+mặt) trước = sau. (BR-SWP-01, atomic)
- [ ] **UAT-08** — seed NCC + payable 20.000.000 + số dư gửi ≥ 20tr; `POST /supplier-deposit-payment {depositAccountId, allocations:[{referenceType:PAYABLE, referenceId, amount:20tr}]}` → `deposit_accounts.balance −20tr` **và** remaining payable = 0; saga COMPLETED. Reverse Phiếu chi → payable khôi phục 20tr. (FR-06, BR-BUY-04)
- [ ] Mọi request gửi `X-Branch-Id` + `Authorization` + `X-Idempotency-Key`; scope org+branch verify (không leak — spot-check cross-branch 403/empty, UAT-13 phụ).
- [ ] Replay POST cùng `X-Idempotency-Key` → response REPLAYED, không double-trừ quỹ (idempotency).

## Definition of Done

- [ ] `pnpm --filter @erp/api test:e2e` xanh cho suite này (chạy serial `maxWorkers:1`, `forceExit:true`).
- [ ] Đọc **actual test output**, không chỉ exit message (Kafka consumers giữ handle → teardown treo có thể giả "suite failed"; xem CLAUDE.md).
- [ ] Suite tự seed + teardown sạch (không rớt row rác vào `erp_test`).
- [ ] Không có tiếng Việt trong test source (chỉ assert message English từ BE).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Reuse `global-setup.ts` (auto-create `erp_test`, apply migrations gồm DFS-01). Pattern seed + Supertest mirror suite
E2E cash-vouchers hiện có (tìm `*cash*e2e-spec.ts` trong `apps/api/test/e2e/`).

```ts
describe('Deposit fund spending (E2E)', () => {
  it('UAT-04 blocks over-balance payment', async () => {
    await seedDepositBalance(depositAccountId, 1_000_000);
    const draft = await post('/bank-payments', { depositAccountId, purpose: 'OTHER', lines: [{ description: 'x', amount: 1_500_000 }] });
    const res = await post(`/bank-payments/${draft.id}/post`, {});
    expect(res.status).toBe(400);
    expect((await get(`/deposit-accounts/${depositAccountId}`)).body.balance).toBe('1000000.00');
  });

  it('UAT-05 concurrent payments — only one wins', async () => {
    await seedDepositBalance(depositAccountId, 1_000_000);
    const [a, b] = await Promise.all([draftAndPost(800_000), draftAndPost(800_000)]);
    expect([a.status, b.status].filter((s) => s === 201).length).toBe(1);  // exactly one POSTED
    expect(balance()).resolves.toBe('200000.00');
  });

  it('UAT-06 deposit→cash swap is atomic', async () => { /* assert deposit −5tr AND cash +5tr, sum unchanged */ });
  it('UAT-08 pay supplier by deposit reduces fund + payable', async () => { /* assert fund −20tr, payable 0, saga COMPLETED; reverse restores */ });
});
```

UAT-05 là điểm khó: cần 2 phiếu DRAFT sẵn rồi `Promise.all` post — `SELECT FOR UPDATE` trong `DepositService`
serialize; phiếu thua thấy `balance − amount < 0` → 400.

## Testing Strategy

- E2E là chính (cross-module: bank-payment + deposit + journal + supplier-debt + cash). Unit-level đã cover ở DFS-03..06.
- Chạy: `pnpm --filter @erp/api test:e2e -- deposit-fund-spending`. Verify 4 UAT pass qua output thực.

## Dependencies

- Depends on: TKT-DFS-05, TKT-DFS-06 (endpoints); TKT-DFS-01 (migration apply trong erp_test). FE (DFS-08) không bắt buộc để E2E chạy (E2E hit API trực tiếp).
- Blocks: — (ticket cuối epic).
