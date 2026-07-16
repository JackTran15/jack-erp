# TKT-DFR-09 E2E — reconcile / refund-cancel / period-lock (UAT-09/10/11)

## Epic

[EPIC-15072026 Deposit Fund — Reconcile & Lock](../epics/EPIC-15072026-deposit-fund-reconcile-lock.md)

## Summary

E2E backend (`apps/api/test/e2e/`, DB `erp_test`, serial `maxWorkers:1`) phủ 3 kịch bản UAT trọng yếu GĐ3: đối chiếu lệch phí không tự ghi giảm quỹ (UAT-09), hủy hóa đơn thẻ đã đối chiếu bị chặn (UAT-10), khóa sổ chặn bút toán trong kỳ (UAT-11). Là DoD gate của toàn epic.

## Deliverables

- `apps/api/test/e2e/deposit-recon-lock.e2e-spec.ts` — 3 kịch bản + isolation check + seed helper.

## Acceptance Criteria

- [ ] **UAT-09** — Đối chiếu 3 giao dịch thu tiền gửi, sao kê thấp hơn `12.485` (phí):
  - Seed 3 movements `recon_status=CHUA` với `net_amount` tổng = system_total; POST `/deposit-recon/reconcile` với `stmtTotalAmount = systemTotal − 12.485`, có `note`.
  - Assert batch `status=DISCREPANCY`, movements → `recon_status='LECH'`, tạo **đề xuất bút toán phí (bank_payment DRAFT)**, và **số dư deposit account KHÔNG đổi** (không tự ghi giảm quỹ — BR-REC-03).
  - Thiếu `note` khi lệch → 400 (BR-REC-02).
- [ ] **UAT-10** — Hủy hóa đơn thẻ **đã đối chiếu**:
  - Seed movement từ POS invoice, reconcile (`DA`); phát sự kiện hủy invoice → assert **BLOCKED** (không tạo reversal), message hướng dẫn tạo phiếu hoàn tiền (BR-REF-02). Movement gốc còn nguyên (BR-REF-01).
  - Case đối chứng: movement `CHUA` → hủy → tạo reversal `WITHDRAWAL`, gốc còn nguyên, **fee movement không bị đảo** (BR-REF-03).
- [ ] **UAT-11** — Khóa sổ:
  - POST `/deposit-period-locks` `{ period: '2026-06' }`; tạo `bank_payment` `doc_date=2026-06-15` → assert **409 BLOCKED** (BR-LOCK-01).
  - `doc_date=2026-07-01` (ngoài kỳ) → thành công. Snapshot closing balance có mặt trong lock (BR-LOCK-03).
  - Unlock cần `reason` + quyền `accounting.deposit_period.unlock` → sau unlock, tạo `bank_payment 2026-06-15` thành công.
- [ ] **Isolation (UAT-13):** actor CN A không đối chiếu/khóa/xem được dữ liệu CN B (403/không trả row).
- [ ] Idempotent replay: gửi lại reconcile/reversal cùng `X-Idempotency-Key` → không double.

## Definition of Done

- [ ] `pnpm --filter @erp/api test:e2e` xanh trên `erp_test` (pre-seed schema + migrations; teardown Kafka có thể treo — đọc output thật, không tin exit message).
- [ ] Spec phủ đủ 3 UAT + isolation + idempotent.
- [ ] Không đổi `synchronize`; migrations áp qua global-setup.
- [ ] Không tiếng Việt trong backend source (test identifiers/messages English).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Theo pattern cash-voucher E2E (`EPIC-18052026` `TKT-CV-12`) + `apps/api/test/e2e/setup/global-setup.ts` (auto-create `erp_test`, apply migrations). Seed org + branch + user + deposit account + deposit_payment_policy (fee_rate) + movements qua repo/helper.

```ts
describe('Deposit reconcile & lock (GĐ3)', () => {
  it('UAT-09: statement short by fee → LECH, proposes fee entry, fund unchanged', async () => {
    const before = await getDepositBalance(acc.id);
    const res = await http.post('/deposit-recon/reconcile').send({ depositAccountId: acc.id, movementIds, stmtTotalAmount: systemTotal - 12485, note: 'phí acquirer', stmtFromDate, stmtToDate });
    expect(res.body.status).toBe('DISCREPANCY');
    expect(await getReconStatus(movementIds)).toEqual(['LECH','LECH','LECH']);
    expect(await countDraftFeeAdjustments(res.body.batch.id)).toBe(1);
    expect(await getDepositBalance(acc.id)).toBe(before); // BR-REC-03: no auto reduce
  });

  it('UAT-10: cancel reconciled card invoice → blocked, guided to refund voucher', async () => { /* reconcile then cancel → 409 */ });
  it('UAT-11: lock June → bank payment dated 2026-06-15 blocked; unlock → allowed', async () => { /* 409 then success after unlock */ });
  it('UAT-13: branch A actor cannot see branch B recon rows', async () => { /* scoped */ });
});
```

## Testing Strategy

- E2E là chính (cross-module: reconcile + fee proposal + reversal + lock + POS event). Chạy serial (`maxWorkers:1`, `forceExit:true`).
- Kiểm tra idempotency bằng gửi trùng `X-Idempotency-Key`.

## Dependencies

- Depends on: TKT-DFR-08 (FE + BE contract khớp), và transitively DFR-02..06.
- Blocks: — (leaf; DoD gate của epic).
