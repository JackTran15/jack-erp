# TKT-DF-11 E2E gate — UAT-01/02/03/12/13

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

Cổng chốt của epic: E2E tự động (`apps/api/test/e2e/`, DB `erp_test`) chứng minh 5 kịch bản UAT nền tảng chạy end-to-end
qua đúng đường dẫn production (checkout POS → publish → consume → movement → ledger). Đây là bằng chứng "mọi giao dịch
phi tiền mặt xuất hiện đúng trong sổ, số dư khớp thủ công" (tiêu chí GĐ1). Trọng tâm: idempotency (UAT-03) và
branch-isolation (UAT-13) — 2 rủi ro tài chính/bảo mật cao nhất.

## Deliverables

- `apps/api/test/e2e/deposit-fund.e2e-spec.ts` — 5 kịch bản UAT (dưới). Seed org + branch + user + 1 deposit account mặc định + mapping (card→DEPOSIT) + COA 112x.
- (nếu cần) helper seed trong `apps/api/test/e2e/setup/` — tài khoản tiền gửi + mapping fixtures.

## Acceptance Criteria

- [ ] **UAT-01** — POS bán 1.135.000 thanh toán `card` (mapped DEPOSIT): sau checkout, `deposit_movements` có **đúng 1** row `source=POS_INVOICE`, `type=DEPOSIT`, `amount=1135000`, `recon_status=CHUA`; `deposit_account.balance` +1.135.000; movement xuất hiện trong `GET /deposit-ledger`.
- [ ] **UAT-02** — split 500.000 `cash` + 635.000 `bank_transfer`: quỹ tiền mặt +500.000 (cash_movement), quỹ tiền gửi +635.000 (deposit_movement); **2 bút toán tách 2 quỹ**, không gộp (BR-MAP-01).
- [ ] **UAT-03 (idempotency — R3/BR-POS-01)** — replay event checkout **×3** (cùng `invoiceId` + `invoicePaymentId`): `deposit_movements` vẫn **đúng 1** row; balance không nhân đôi; consumer nuốt unique violation. Chứng minh guard là DB unique index (không phải app check).
- [ ] **UAT-12 (ledger opening — BR-LEDG-02)** — seed movement rải trước và trong tháng 5; `GET /deposit-ledger?dateFrom=2026-05-01&dateTo=2026-05-31`: `openingBalance` = số dư đến hết 30/04 (opening_balance + signed sum trước 01/05); running balance từng dòng chính xác; `total` **không** đếm dòng đầu kỳ.
- [ ] **UAT-13 (branch isolation — BR-PERM-01)** — user CN A gọi `/deposit-ledger` + generic CRUD `deposit_accounts` với `X-Branch-Id` của CN A: **không** thấy movement/tài khoản của CN B; đổi header sang CN B (không có scope) → 403/empty. Cross-tenant cũng bị chặn.
- [ ] Test chạy qua đường thật (HTTP checkout + Kafka consume), không gọi thẳng service nội bộ để "giả" kết quả auto-post.
- [ ] Suite chạy serial (`maxWorkers:1`, `forceExit:true`) — đọc output thật, không tin message teardown (kafkajs để handle mở; hung teardown ≠ test fail).

## Definition of Done

- [ ] `pnpm --filter @erp/api test:e2e` xanh (erp_test auto-create + migrate qua `global-setup`).
- [ ] `pnpm --filter @erp/api test` + `lint` xanh (unit của DF-03/04/05/06 vẫn pass).
- [ ] 5 UAT đều assert số dư + số dòng movement cụ thể (không chỉ status 200).
- [ ] Không đổi schema; `synchronize` giữ false.
- [ ] Không có tiếng Việt trong backend source (spec English; mô tả `it('...')` English).
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

Reuse harness E2E hiện có (`apps/api/test/e2e/setup/global-setup.ts` load `.env`, tạo `erp_test`, chạy migrations).
Mirror E2E voucher tiền mặt (TKT-CV-12). Idempotency test replay event bằng cách publish lại cùng payload / gọi lại
consumer handler 3 lần (mirror cách E2E cash test replay), assert count = 1.

```ts
describe('Deposit Fund foundation (GĐ1)', () => {
  it('UAT-01: POS non-cash sale posts exactly one deposit movement (CHUA, balance+)', async () => { /* checkout card 1135000 → 1 movement, balance +1135000 */ });
  it('UAT-02: split cash+transfer routes to two funds', async () => { /* cash +500k, deposit +635k */ });
  it('UAT-03: replaying the checkout event x3 yields exactly one movement', async () => {
    await publishDepositEvent(payload); await publishDepositEvent(payload); await publishDepositEvent(payload);
    const rows = await countDepositMovements(invoiceId, invoicePaymentId);
    expect(rows).toBe(1); // DB unique index guard
  });
  it('UAT-12: ledger opening balance for a date range', async () => { /* opening = balance to 30/04, running exact */ });
  it('UAT-13: branch isolation — CN A cannot see CN B data', async () => { /* /deposit-ledger + CRUD scoped */ });
});
```

## Testing Strategy

- Đây **là** ticket testing của epic; verification = suite xanh. Mỗi UAT map 1:1 ref.md §12.
- Nếu message assert số dư âm khác chuỗi service throw (`'Insufficient deposit balance'`) → align spec theo message thật (note PR), giống learning EPIC-18052026.

## Dependencies

- Depends on: TKT-DF-05 (auto-post), TKT-DF-06 (ledger), TKT-DF-10 (FE — manual-flow verify), gián tiếp toàn epic.
- Blocks: — (cổng cuối GĐ1; mở khóa GĐ2 DFS).
