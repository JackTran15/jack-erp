# TKT-DFR-03 Transaction fee handling — 2-line posting (R1, highest risk)

## Epic

[EPIC-15072026 Deposit Fund — Reconcile & Lock](../epics/EPIC-15072026-deposit-fund-reconcile-lock.md)

## Summary

Xử lý **phí giao dịch acquirer (R1 — rủi ro cao nhất)**. Khi auto-post thu tiền gửi từ POS (hoặc khi đối chiếu), ghi **2 bút toán**: (1) Thu tiền gửi `+amount` gross (khớp doanh thu hóa đơn), (2) Chi phí ngân hàng `−fee_amount` (Mục chi = `BANK_FEE`, `affect_expense=true`) — số dư ròng = `amount − fee` khớp sao kê. `fee_amount` ước tính theo `fee_rate` từ `deposit_payment_policy`, điều chỉnh về thực tế khi đối chiếu. Chênh lệch khi đối chiếu → tạo **đề xuất bút toán điều chỉnh (DRAFT)** cho kế toán duyệt, **KHÔNG tự ghi giảm quỹ** (BR-REC-03). Hoàn tiền thẻ **không hoàn phí** (BR-REF-03).

> ⛔ **OQ-01 gates this ticket.** `fee_bearer` (cửa hàng hay khách chịu) quyết định net: `MERCHANT` → `fee_amount = round(amount*fee_rate)`, `net = amount − fee`; `CUSTOMER` → `fee_amount = 0`, `net = amount`. Không hard-code — đọc `fee_bearer` từ `deposit_payment_policy`. Mặc định `MERCHANT` nếu chưa chốt (hoặc khi policy `fee_bearer` NULL).

## Deliverables

- `apps/api/src/modules/accounting/deposit-fee/deposit-fee.service.ts` — `computeFee()`, `postFee()` (2-line), `proposeFeeAdjustment()`.
- `apps/api/src/modules/accounting/deposit-fee/deposit-fee.module.ts` — wiring; export `DepositFeeService`.
- **Sửa consumer auto-post GĐ1** (`apps/api/src/modules/accounting/.../deposit-auto-post.consumer.ts` — điểm mở rộng của TKT-DF-03): sau khi tạo DEPOSIT movement gross, gọi `DepositFeeService.postFee(movement, policy, manager)` trong **cùng transaction**. (GĐ1 để cột `fee_amount`/`net_amount` = default; GĐ3 điền LOGIC.)
- Seed danh mục `cash_voucher_categories` bổ sung `BANK_FEE` ("Phí ngân hàng", `affect_expense=true` semantics) nếu chưa có — reuse `cash-voucher-categories/cash-voucher-category.seeder.ts`.
- COA seed: đảm bảo TK chi phí dịch vụ ngân hàng (`6417`/`641`) tồn tại — bổ sung vào `accounting/seeders/coa-seeder.service.ts` nếu thiếu (theo pattern TK 711/811 của cash epic).

## Acceptance Criteria

- [ ] `computeFee(amount, policy)`: `MERCHANT` → `fee = round2(amount * fee_rate)`, `net = amount − fee`; `CUSTOMER` → `fee=0`, `net=amount`. Làm tròn `numeric(18,2)`, không float (NFR-06).
- [ ] Worked example khớp chính xác: `amount=1.135.000`, Visa `fee_rate=0.011` → `fee=12.485`, `net=1.122.515` (R1).
- [ ] `postFee()` ghi 2 bút toán trong 1 tx: cập nhật `deposit_movements.fee_amount`/`net_amount` + tạo movement thứ 2 `type=WITHDRAWAL amount=fee source=SYSTEM` category `BANK_FEE`, JE `DR 641x / CR 112x` qua `recordMovement(..., manager)`. Số dư ròng deposit account = `+gross − fee = +net`.
- [ ] Bút toán gross vẫn khớp doanh thu hóa đơn (`+amount`, không phải `+net`) — không double-count doanh thu (R4/BR-POS-02): revenue đã có từ hóa đơn POS, movement chỉ ghi quỹ.
- [ ] `proposeFeeAdjustment({ batch, diff }, actor, manager)`: tạo **`bank_payment` DRAFT** (reuse spending `CashPaymentService`-tương-đương cho deposit), `purpose=BANK_FEE_ADJUSTMENT`, `amount=|diff|`, contra `641x` — **KHÔNG post, KHÔNG đổi balance** (BR-REC-03). Trả `proposalId` cho DFR-02.
- [ ] Điều chỉnh ước tính → thực tế: khi reconcile, nếu `diff` do chênh phí → `proposeFeeAdjustment` bù phần lệch (kế toán duyệt DRAFT → post mới đổi quỹ).
- [ ] Refund (DFR-05) **không** gọi reverse trên fee movement — phí giữ nguyên là chi phí (BR-REF-03).
- [ ] Toàn bộ chạy trong transaction của consumer/reconcile (atomic); idempotent qua unique index của movement thứ 2 (`source=SYSTEM`, `source_ref_id=grossMovementId`, `source_ref_line_id='FEE'`) — replay không double-post phí.
- [ ] Query lọc `organizationId` (+`branchId`); không leak.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: computeFee MERCHANT/CUSTOMER, worked example 1.135.000→net 1.122.515, postFee 2-line balance, proposeFeeAdjustment DRAFT không đổi balance, idempotent replay phí.
- [ ] Không đổi `synchronize`; không schema change ngoài DFR-01 (+ seed).
- [ ] Endpoint/consumer đổi → openapi regen ở DFR-07.
- [ ] Không tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
@Injectable()
export class DepositFeeService {
  constructor(
    private readonly cash: CashService,               // recordMovement(dto, actor, manager?) → {movement, journalEntryId}
    private readonly accountResolver: AccountResolverService, // 641x bank-fee expense COA
    private readonly bankPayments: BankPaymentService, // spending (DFS) — DRAFT voucher for proposals
  ) {}

  computeFee(amount: number, policy: DepositPaymentPolicy): { feeAmount: number; netAmount: number } {
    if (policy.feeBearer === FeeBearer.CUSTOMER) return { feeAmount: 0, netAmount: amount }; // OQ-01 (null → MERCHANT default)
    const feeAmount = round2(amount * Number(policy.feeRate));
    return { feeAmount, netAmount: round2(amount - feeAmount) };
  }

  /** Called from auto-post consumer, in the consumer's tx. Two-line posting (R1). */
  async postFee(gross: DepositMovementEntity, policy: DepositPaymentPolicy, m: EntityManager, actor: ActorContext) {
    const { feeAmount, netAmount } = this.computeFee(Number(gross.amount), policy);
    await m.getRepository(DepositMovementEntity).update({ id: gross.id }, { feeAmount, netAmount });
    if (feeAmount === 0) return;
    await this.cash.recordMovement({
      depositAccountId: gross.depositAccountId, type: MovementType.WITHDRAWAL, amount: feeAmount,
      source: MovementSource.SYSTEM, sourceRefId: gross.id, sourceRefLineId: 'FEE', // idempotency key (D2)
      categoryCode: 'BANK_FEE', affectExpense: true,
      contraAccountId: this.accountResolver.resolveContraAccount('BANK_FEE', actor).id, // DR 641x
    }, actor, m);
  }

  /** BR-REC-03: proposal only — DRAFT bank_payment, NOT an auto balance change. */
  async proposeFeeAdjustment(input: { batch: DepositReconBatchEntity; diff: number }, actor: ActorContext, m: EntityManager) {
    return this.bankPayments.createDraft({
      depositAccountId: input.batch.depositAccountId, amount: Math.abs(input.diff),
      purpose: 'BANK_FEE_ADJUSTMENT', reconBatchId: input.batch.id,
      contraAccountId: this.accountResolver.resolveContraAccount('BANK_FEE', actor).id,
    }, actor, m); // stays DRAFT — accountant reviews & posts
  }
}
```

Reuse: `CashService.recordMovement` (fund + JE template — reuse map), `AccountResolverService` (COA 641x), spending `BankPaymentService` (DFS DRAFT voucher), `deposit_payment_policy` (GĐ1, fee_rate/fee_bearer). `round2` = helper hiện có hoặc `Math.round(x*100)/100` trên `numeric` string-parsed value (không float accumulation).

**JournalSource:** dùng `BANK_MOVEMENT` (thêm ở GĐ1 hoặc bổ sung nếu thiếu — reuse map ghi "add `BANK_MOVEMENT`").

## Testing Strategy

- Unit (`deposit-fee.service.spec.ts`): computeFee MERCHANT vs CUSTOMER; worked example (1.135.000 * 0.011 = 12.485, net 1.122.515) — assert exact integer VND; postFee tạo movement WITHDRAWAL fee + update gross net; feeAmount=0 → không tạo movement 2; proposeFeeAdjustment trả DRAFT không post (balance không đổi); replay cùng gross.id → không double-post (unique `source_ref_line_id='FEE'`).
- E2E: DFR-09 UAT-09 (reconcile 3 txns, sao kê lệch 12.485 → LECH + đề xuất phí, quỹ không giảm).

## Dependencies

- Depends on: TKT-DFR-01 (schema); GĐ1 `TKT-DF-02/03` (`deposit_payment_policy` fee_rate/fee_bearer, auto-post consumer hook); GĐ2 (`BankPaymentService` DRAFT voucher). ⛔ **OQ-01 phải chốt trước.**
- Blocks: TKT-DFR-02 (`proposeFeeAdjustment`), TKT-DFR-07 (openapi), TKT-DFR-09 (E2E).
