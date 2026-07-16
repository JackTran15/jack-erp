# TKT-DFS-05 Trả nhà cung cấp bằng tiền gửi (FR-06 saga)

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Giai đoạn 2: Chi tiêu](../epics/EPIC-15072026-deposit-fund-spending.md)

## Summary

FR-06: cho phép chi nhánh dùng số dư tiền gửi thanh toán cho NCC. Xây `SupplierDepositPaymentSagaService` +
controller — **mirror `supplier-debt-payment-saga.service.ts` 1:1**, nhưng chân chi tiền dùng `BankPaymentService`
(quỹ tiền gửi) thay vì `CashPaymentService`. Trong **1 local transaction**: tạo Phiếu chi tiền gửi POSTED
(`purpose=SUPPLIER_PAYMENT`, `referenceType=GOODS_RECEIPT|PAYABLE`, link `purchase_order_id`/`payable_id`) → ghi giảm quỹ,
đồng thời ghi giảm công nợ phải trả NCC. Reverse khôi phục công nợ; chặn reverse nếu đã đối chiếu (BR-BUY-04).

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/supplier-deposit-payment/supplier-deposit-payment-saga.service.ts` — mirror `supplier-debt-payment-saga.service.ts`.
- `.../supplier-deposit-payment-saga.entity.ts` — `@Entity('supplier_deposit_payment_saga')` mirror `supplier-debt-payment-saga.entity.ts` (status PENDING/COMPLETED/COMPENSATED/FAILED, `bank_payment_id`, allocations jsonb).
- `.../supplier-deposit-payment.controller.ts` — `POST /supplier-deposit-payment`, perms `accounting.bank_payment.create` + `accounting.supplier_debt.pay`.
- `.../dto/create-supplier-deposit-payment.dto.ts` — mirror `create-supplier-debt-payment.dto.ts` + required `depositAccountId`, `fund: 'DEPOSIT'`, `allocations: {referenceType, referenceId, amount}[]`.
- `.../supplier-deposit-payment-saga.service.spec.ts` — unit spec.
- Migration cho `supplier_deposit_payment_saga` — **gộp vào DFS-01 migration** hoặc migration nhỏ riêng `1786600000001-AddSupplierDepositPaymentSaga.ts` (mirror `1781500000004-AddSupplierDebtPaymentSaga.ts`). Chọn 1, ghi rõ trong Deliverables của DFS-01 nếu gộp.
- Cập nhật `deposit-vouchers.module.ts` — provider + controller + `TypeOrmModule.forFeature([SupplierDepositPaymentSagaEntity])`; import `SupplierDebtModule`.

## Acceptance Criteria

- [ ] **FR-06 entry**: từ Phiếu nhập (`purchase_order_id`) hoặc Công nợ phải trả (`payable_id`), chọn nguồn quỹ = Tiền gửi + `depositAccountId` → tạo Phiếu chi `purpose=SUPPLIER_PAYMENT`, `referenceType=GOODS_RECEIPT`/`PAYABLE`, link đúng id.
- [ ] **BR-BUY-01**: mỗi allocation `amount ≤ remaining payable` của NCC; vượt → 400. **OQ-05 gate**: ứng trước (chi > công nợ) **cấm** ở GĐ2 (không có cờ `allowAdvance`) — nếu nghiệp vụ chốt cho phép thì mở sau.
- [ ] **BR-BUY-02**: hỗ trợ **thanh toán một phần** (allocation < remaining) và **nhiều phiếu nhập / payable bằng 1 phiếu chi** (`allocations[]` nhiều dòng, tổng = `bank_payment.total_amount`).
- [ ] **BR-BUY-03 (hỗn hợp)**: một phần tiền mặt + một phần tiền gửi → sinh **2 phiếu chi thuộc 2 quỹ** (1 `cash_payment` + 1 `bank_payment`) nhưng cùng **1 nghiệp vụ/saga** (cùng `saga_id`, cùng allocations). Client gửi `legs: [{fund:CASH,...},{fund:DEPOSIT,...}]`; cả 2 chân trong 1 tx.
- [ ] **BR-BUY-04**: reverse Phiếu chi → **khôi phục công nợ** (payable += amount); **chặn reverse nếu movement đã đối chiếu** (`deposit_movements.recon_status != CHUA`) → 400.
- [ ] Toàn nghiệp vụ trong **1 transaction**: `BankPaymentService.createAndPostInternal` (giảm quỹ) + `SupplierDebtService.reducePayable` (giảm nợ) atomic — 1 chân fail → rollback cả hai. Saga row là control handle (PENDING→COMPLETED / COMPENSATED).
- [ ] Query filter `actor.organizationId` + `actor.branchId`; NCC validate cùng org (BR-PERM-01).
- [ ] Mutation kế thừa `IdempotencyInterceptor`; saga idempotent qua `uniq_bank_payments_reference` trên `(org, PAYABLE, payable_id)`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: partial payment, multi-doc single voucher, over-remaining 400, mixed cash+deposit (2 vouchers 1 saga), reverse khôi phục payable, reverse-when-reconciled 400.
- [ ] Endpoints mới → openapi regen ở TKT-DFS-07.
- [ ] Không đụng `synchronize` ngoài migration saga (nếu tách).
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Mirror `supplier-debt-payment-saga.service.ts` (~13.6KB). Chỉ đổi chân chi: `CashPaymentService.createAndPostInternal`
→ `BankPaymentService.createAndPostInternal` (DFS-04), nguồn quỹ = `depositAccountId`. `SupplierDebtService.reducePayable`
tái dùng nguyên (`1781500000003-AddSupplierDebts.ts`).

```ts
async pay(dto: CreateSupplierDepositPaymentDto, actor: ActorContext) {
  return this.dataSource.transaction(async (m) => {
    const saga = await m.save(m.create(SupplierDepositPaymentSagaEntity, { status: 'PENDING', organizationId: actor.organizationId, branchId: actor.branchId }));
    for (const a of dto.allocations) {
      const remaining = await this.supplierDebt.getRemaining(a.referenceType, a.referenceId, actor, m);
      if (a.amount > remaining) throw new BadRequestException('Payment exceeds remaining payable'); // BR-BUY-01 (OQ-05 gate)
    }
    const bankPayment = await this.bankPayment.createAndPostInternal(
      { depositAccountId: dto.depositAccountId, purpose: BankPaymentPurpose.SUPPLIER_PAYMENT,
        referenceType: dto.allocations[0].referenceType, referenceId: dto.allocations[0].referenceId,
        lines: dto.allocations.map((a) => ({ description: a.note, amount: a.amount })) }, actor, m);
    await this.supplierDebt.reducePayable(dto.allocations, m);     // BR-BUY-02 multi-doc
    await m.update(SupplierDepositPaymentSagaEntity, saga.id, { status: 'COMPLETED', bankPaymentId: bankPayment.id });
    return { bankPayment, saga };
  });
}
```

BR-BUY-03 mixed: nếu `dto.legs` có cả CASH + DEPOSIT → loop từng leg gọi service quỹ tương ứng (`CashPaymentService` /
`BankPaymentService`) trong **cùng** `m`, cùng `saga.id`; `reducePayable` gọi 1 lần với tổng allocations.
BR-BUY-04 reverse: kiểm `deposit_movements.recon_status` trước `journal.reverse` + `restorePayable`.

## Testing Strategy

- Unit (`supplier-deposit-payment-saga.service.spec.ts`): mirror `supplier-debt-payment-saga.service.spec.ts`. Cases:
  partial + multi-doc (allocations tổng = total), over-remaining → 400, mixed CASH+DEPOSIT → 2 vouchers cùng saga,
  reverse → payable restored, reverse when reconciled → 400.
- E2E (DFS-09): **UAT-08** — trả NCC 20tr bằng tiền gửi → `deposit_accounts.balance −20tr`, payable −20tr, saga COMPLETED.
  Seed NCC + payable 20tr + deposit account balance ≥ 20tr.

## Dependencies

- Depends on: TKT-DFS-03, TKT-DFS-04 (`createAndPostInternal`); `SupplierDebtService` (đã có, EPIC cash-vouchers).
- Blocks: TKT-DFS-07.
