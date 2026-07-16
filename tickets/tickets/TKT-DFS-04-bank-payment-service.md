# TKT-DFS-04 BankPaymentService + Controller (Phiếu chi tiền gửi)

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Giai đoạn 2: Chi tiêu](../epics/EPIC-15072026-deposit-fund-spending.md)

## Summary

`BankPaymentService` + `BankPaymentController` cho Phiếu chi tiền gửi (FR-05) — **đối xứng với DFS-03**, mirror
`CashPaymentService` / `CashPaymentController` 1:1. Điểm khác cash quan trọng: (1) purpose set đầy đủ theo ref.md §6.5
gồm `SUPPLIER_PAYMENT`/`PURCHASE` (option "Trả NCC / Mua hàng" bị thiếu ở màn hiện tại — ref.md §13); (2) **chặn số dư âm**
tại `post()` (BR-CHI-01, `SELECT deposit_account FOR UPDATE`); (3) `affect_expense` bị **disable + uncheck cứng** cho
`CASH_TRANSFER`/`INTER_BRANCH_OUT` (BR-CHI-05); (4) phiếu vượt hạn mức → `PENDING_APPROVAL` (BR-CHI-03, stub gated OQ-08).

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/bank-payments/bank-payments.service.ts` — `BankPaymentService` mirror `cash-payments.service.ts`.
- `deposit-vouchers/bank-payments/bank-payments.controller.ts` — `BankPaymentController`, base route `bank-payments`, guards + `@Actor()` + `AuditInterceptor`.
- `deposit-vouchers/bank-payments/bank-payments.service.spec.ts` — unit spec.
- Cập nhật `deposit-vouchers.module.ts` — `BankPaymentService` provider + controller, export `BankPaymentService`.
- Permissions seed — `accounting.bank_payment.{create,read,update,delete,post,reverse}`.

## Endpoints (mirror cash-payments)

| Method | Path | Perm |
| --- | --- | --- |
| POST | `/bank-payments` | `accounting.bank_payment.create` |
| GET / GET `:id` | `/bank-payments` | `accounting.bank_payment.read` |
| PATCH `:id` | `/bank-payments/:id` | `accounting.bank_payment.update` (DRAFT only) |
| DELETE `:id` | `/bank-payments/:id` | `accounting.bank_payment.delete` (DRAFT only) |
| POST `:id/post` | `/bank-payments/:id/post` | `accounting.bank_payment.post` |
| POST `:id/reverse` | `/bank-payments/:id/reverse` | `accounting.bank_payment.reverse` |

## Acceptance Criteria

- [ ] **Purposes (ref.md §6.5 full set)**: `SUPPLIER_PAYMENT`/`PURCHASE` (Trả NCC / Mua hàng — thiếu ở §13), `EXPENSE`, `CASH_TRANSFER` (Chuyển tiền gửi → tiền mặt), `INTER_BRANCH_OUT` (Chuyển đến CN khác — stub GĐ4), `REFUND`, `BANK_FEE`, `OTHER`.
- [ ] **BR-CHI-01 (chặn âm quỹ)**: `post()` mở tx → `SELECT deposit_account FOR UPDATE` → nếu `balance − amount < 0` **và** `allow_negative=false` → 400 với message nêu số dư khả dụng (UAT-04). Reuse guard trong `DepositService.recordMovement(WITHDRAWAL)` (mirror `CashService` `newBalance < 0`).
- [ ] **NFR-03 (race)**: `SELECT FOR UPDATE` đảm bảo 2 phiếu chi 800k đồng thời trên số dư 1tr → chỉ 1 POSTED, 1 → 400 (UAT-05).
- [ ] **BR-CHI-05**: khi `purpose ∈ {CASH_TRANSFER, INTER_BRANCH_OUT}` → server **ép `affect_expense=false`** dù client gửi true (dịch chuyển quỹ, không phải chi phí); DFS-08 FE disable+uncheck checkbox.
- [ ] **BR-CHI-03 (hạn mức)**: nếu `amount > configuredLimit` → `post()` set `status=PENDING_APPROVAL` + `approval_status=PENDING`, **không** ghi giảm quỹ; chỉ trừ quỹ khi duyệt. **Stub gated OQ-08**: chưa có config hạn mức → skip nhánh này (không set PENDING_APPROVAL); enum + cột đã sẵn ở DFS-01, endpoint `/approve` để GĐ sau.
- [ ] **BR-CHI-02 (kỳ khóa)**: `doc_date` không thuộc kỳ đã khóa → 400. **Stub GĐ3**: hook `assertPeriodNotLocked(docDate, actor)` gọi service GĐ3 nếu có, chưa có → no-op (không chặn). Ghi rõ TODO-gate trong ticket, không trong source.
- [ ] **POST**: `DepositService.recordMovement({WITHDRAWAL, depositAccountId, amount: total}, actor, m)` → link movement+JE; balance −total.
- [ ] **REVERSE**: chỉ POSTED; reversal voucher lines copy giữ amount>0, movement type đảo `DEPOSIT` (trả tiền lại), `JournalService.reverse`; balance khôi phục; dedupe qua `uniq_bank_payments_reversal`.
- [ ] `createAndPostInternal()` + `createVoucherForMovement()` cùng signature DFS-03 (dùng cho DFS-05 saga NCC + DFS-06 swap).
- [ ] Query filter `actor.organizationId` + `actor.branchId`; total = Σ lines (BR-THU-01 tương đương cho chi).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: insufficient-balance → 400, race (concurrent 2 phiếu) chỉ 1 pass, CASH_TRANSFER ép affect_expense=false, reverse → DEPOSIT movement + balance khôi phục.
- [ ] Endpoints mới → openapi regen ở TKT-DFS-07.
- [ ] Không đụng `synchronize` / migration.
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không TODO/FIXME trong source (gate BR-CHI-02/03 chỉ nêu trong ticket).

## Tech Approach

Mirror `cash-payments.service.ts`. `DepositService.recordMovement(WITHDRAWAL)` đã chặn số dư âm (mirror `CashService`
`if (newBalance < 0) throw BadRequestException` — align message với chuỗi E2E assert ở DFS-09).

```ts
async post(id: string, actor: ActorContext) {
  return this.dataSource.transaction(async (m) => {
    const v = await m.findOne(BankPaymentEntity, { where: { id, organizationId: actor.organizationId, branchId: actor.branchId }, relations: ['lines'], lock: { mode: 'pessimistic_write' } });
    if (!v || v.status !== BankVoucherStatus.DRAFT) throw new BadRequestException('...');
    this.assertTotalMatchesLines(v);
    if (v.purpose === BankPaymentPurpose.CASH_TRANSFER || v.purpose === BankPaymentPurpose.INTER_BRANCH_OUT) v.affectExpense = false; // BR-CHI-05
    // BR-CHI-03: const limit = await this.approvalLimit(actor); if (limit && v.totalAmount > limit) { v.status = PENDING_APPROVAL; return m.save(v); }  // gated OQ-08
    const number = await this.docNumber.generate(DocumentType.BANK_PAYMENT, actor.branchId, actor);
    const { movement, journalEntryId } = await this.deposit.recordMovement(
      { type: DepositMovementType.WITHDRAWAL, depositAccountId: v.depositAccountId, amount: v.totalAmount, source: 'MANUAL' }, actor, m); // BR-CHI-01 guard inside (SELECT FOR UPDATE)
    Object.assign(v, { status: BankVoucherStatus.POSTED, documentNumber: number, depositMovementId: movement.id, journalEntryId });
    return m.save(v);
  });
}
```

`createAndPostInternal(SUPPLIER_PAYMENT)` là entry point cho DFS-05; `createAndPostInternal(CASH_TRANSFER)` cho DFS-06.

## Testing Strategy

- Unit (`bank-payments.service.spec.ts`): mirror `cash-payments.service.spec.ts`. Cases: post insufficient balance → 400
  (message assert); CASH_TRANSFER ép affect_expense=false; reverse → recordMovement(DEPOSIT) + journal.reverse; total-mismatch → 400.
- E2E (DFS-09): UAT-04 (chi 1.5tr trên 1tr → blocked, message số dư khả dụng), UAT-05 (2 phiếu 800k đồng thời → 1 pass) —
  race cần e2e thật (2 request song song), không mock được `FOR UPDATE`.

## Dependencies

- Depends on: TKT-DFS-02; EPIC foundation (`DepositService`).
- Blocks: TKT-DFS-05, TKT-DFS-06, TKT-DFS-07.
