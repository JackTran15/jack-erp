# TKT-DFR-05 Refund / cancel of non-cash POS invoice (FR-11)

## Epic

[EPIC-15072026 Deposit Fund — Reconcile & Lock](../epics/EPIC-15072026-deposit-fund-reconcile-lock.md)

## Summary

Xử lý hủy/hoàn hóa đơn POS thanh toán phi tiền mặt (thẻ/chuyển khoản). Hủy → sinh **bút toán đảo** (`Chi` tiền gửi = `WITHDRAWAL` gross) qua `JournalService.reverse`, **KHÔNG xóa** bút toán gốc (giữ vết audit — BR-REF-01, R6). Nếu bút toán gốc **đã đối chiếu** (`recon_status IN ('DA','LECH')`) → **chặn hủy trực tiếp**, hướng người dùng tạo **phiếu chi `Hoàn tiền khách hàng` riêng** (BR-REF-02). Hoàn tiền thẻ **không hoàn phí acquirer** — phí đã trả giữ nguyên là chi phí (BR-REF-03): reversal chỉ đảo bút toán gross, **không** đảo movement phí.

> ⛔ **OQ-09 gates this ticket.** "Refund qua máy POS hay chuyển khoản trả khách?" quyết định phiếu hoàn tiền là `bank_payment` (chuyển khoản) hay ghi nhận refund-tại-POS. Mặc định: phiếu chi `CUSTOMER_REFUND` (bút toán chi tiền gửi).

## Deliverables

- `apps/api/src/modules/accounting/deposit-refund/deposit-refund.service.ts` — `reverseForCancelledInvoice(invoiceId, actor)` + guard đã-đối-chiếu.
- `apps/api/src/modules/accounting/deposit-refund/deposit-refund.consumer.ts` — `@OnDomainEvent(...)` trên sự kiện hủy/void hóa đơn POS phi tiền mặt (đối xứng auto-post GĐ1). Idempotent qua `processed_events` + unique index reversal.
- `apps/api/src/modules/accounting/deposit-refund/deposit-refund.module.ts` — wiring.
- Bổ sung enum `purpose` phiếu chi tiền gửi `CUSTOMER_REFUND` (nếu chưa có ở DFS `bank_payment` purpose enum) — reuse `BankPaymentService`.
- Permission seed: `accounting.deposit_movement.reverse` (Kế toán / Kế toán trưởng).

## Acceptance Criteria

- [ ] Hủy hóa đơn phi tiền mặt khi movement gốc `recon_status='CHUA'` → tạo movement `WITHDRAWAL` amount=**gross** + `JournalService.reverse(grossJournalEntryId)`; **KHÔNG xóa** movement gốc (BR-REF-01); ghi `deposit_audit_log(action='REVERSE', before, after)` (R6, NFR-05).
- [ ] Reversal **KHÔNG** đảo movement phí (`source_ref_line_id='FEE'`) — phí giữ nguyên chi phí (BR-REF-03). Kết quả số dư: gross bị rút ra, fee expense vẫn còn.
- [ ] Movement gốc `recon_status IN ('DA','LECH')` → gọi `DepositReconService.assertNotReconciled` → **409 BLOCKED**, message hướng dẫn "tạo Phiếu chi hoàn tiền khách hàng riêng" (BR-REF-02). Không tạo reversal.
- [ ] Phiếu chi `CUSTOMER_REFUND` (đường BR-REF-02): `bank_payment` POSTED, contra = TK phải trả khách / 131, amount = gross; giữ phí (không hoàn).
- [ ] Idempotent: consumer dedupe qua `processed_events` + unique `(source=POS_INVOICE, source_ref_id=invoiceId, source_ref_line_id='REVERSAL')` — replay/void 2 lần chỉ 1 reversal (NFR-04, R3-style).
- [ ] Reversal nằm trong kỳ khóa → chặn qua `DepositPeriodGuardService.assertNotLocked` (DFR-06, BR-LOCK-01).
- [ ] Mọi query lọc `organizationId` (+`branchId`); không leak.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: reverse khi CHUA (gốc còn nguyên, fee không đảo), block khi DA/LECH, idempotent replay void, refund voucher giữ phí.
- [ ] Không đổi `synchronize`; không schema change ngoài DFR-01.
- [ ] Consumer/endpoint đổi → openapi regen ở DFR-07.
- [ ] Không tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
@Injectable()
export class DepositRefundService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cash: CashService,                    // recordMovement (WITHDRAWAL reversal)
    private readonly journal: JournalService,              // reverse(jeId, manager)
    private readonly recon: DepositReconService,           // assertNotReconciled (BR-REC-01)
    private readonly periodGuard: DepositPeriodGuardService,// assertNotLocked (BR-LOCK-01)
    private readonly audit: DepositAuditService,
  ) {}

  async reverseForCancelledInvoice(invoiceId: string, actor: ActorContext) {
    return this.dataSource.transaction(async (m) => {
      const gross = await m.getRepository(DepositMovementEntity).findOneOrFail({
        where: { source: MovementSource.POS_INVOICE, sourceRefId: invoiceId, sourceRefLineId: Not('FEE'),
                 organizationId: actor.organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      await this.recon.assertNotReconciled(gross.id, m);           // BR-REF-02 → 409 if reconciled
      await this.periodGuard.assertNotLocked(gross.branchId, gross.docDate, m); // BR-LOCK-01

      // BR-REF-01: reverse gross only, keep original + keep fee (BR-REF-03)
      await this.cash.recordMovement({
        depositAccountId: gross.depositAccountId, type: MovementType.WITHDRAWAL, amount: Number(gross.amount),
        source: MovementSource.POS_INVOICE, sourceRefId: invoiceId, sourceRefLineId: 'REVERSAL', // idempotency
      }, actor, m);
      if (gross.journalEntryId) await this.journal.reverse(gross.journalEntryId, m);
      await this.audit.record({ entityType: 'DEPOSIT_MOVEMENT', entityId: gross.id, action: 'REVERSE', before: gross }, actor, m);
    });
  }
}
```

Consumer (đối xứng auto-post GĐ1 `checkout-invoice.service.ts` non-cash branch):

```ts
@Injectable()
export class DepositRefundConsumer {
  @OnDomainEvent(ERP_TOPICS.POS_INVOICE_CANCELLED) // wrapWithIdempotency (processed_events)
  async handle(evt: PosInvoiceCancelledEvent) {
    if (evt.paymentMethod === 'cash') return; // cash handled by cash module
    await this.refund.reverseForCancelledInvoice(evt.invoiceId, evt.actor);
  }
}
```

Reuse: `CashService.recordMovement` + `JournalService.reverse` (reuse map); `DepositReconService.assertNotReconciled` (DFR-02); `DepositPeriodGuardService` (DFR-06); DFS `BankPaymentService` (phiếu hoàn tiền `CUSTOMER_REFUND`); topics/consumer idempotency `modules/events/` (`wrapWithIdempotency`).

## Testing Strategy

- Unit (`deposit-refund.service.spec.ts`): reverse khi CHUA (gốc còn nguyên, fee movement không bị reverse), 409 khi DA/LECH, replay cùng invoiceId → 1 reversal, blocked khi kỳ khóa.
- E2E: DFR-09 UAT-10 (hủy hóa đơn thẻ đã đối chiếu → chặn, hướng dẫn phiếu hoàn tiền).

## Dependencies

- Depends on: TKT-DFR-01 (schema), TKT-DFR-02 (`assertNotReconciled`), TKT-DFR-06 (`assertNotLocked`); GĐ1 (auto-post movement + `journalEntryId`), GĐ2 (`BankPaymentService`). ⛔ **OQ-09 phải chốt trước.**
- Blocks: TKT-DFR-07 (openapi), TKT-DFR-09 (E2E).
