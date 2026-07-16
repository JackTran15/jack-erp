# TKT-DF-05 POS auto-post — DepositFromPaymentPublisher + PosDepositSaleConsumer

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

FR-03: khi hóa đơn POS hoàn tất (`COMPLETED`) và có dòng thanh toán **phi tiền mặt** ánh xạ vào quỹ DEPOSIT, hệ thống
tự sinh **1 giao dịch tiền gửi** loại thu, `source = POS_INVOICE`, `recon_status = CHUA`, cập nhật số dư. Kiến trúc
mirror auto-post tiền mặt: hook đứng **cạnh** filter CASH tại `checkout-invoice.service.ts` L341-370, publish **1
message / dòng thanh toán phi tiền mặt** qua topic mới `DEPOSIT_VOUCHER_NEEDED_POS_SALE`, consumer ghi movement qua
`DepositService.createAndPostInternal()`. Rủi ro tài chính cao nhất của module (R3 double-post) được chặn bằng **DB
unique index** `(POS_INVOICE, invoiceId, invoicePaymentId)` — idempotent thật, không tin app-layer (BR-POS-01). Không
double-count doanh thu: `affect_revenue` **khóa cứng false** (BR-POS-02 / R4).

## Deliverables

- `apps/api/src/modules/accounting/publishers/deposit-from-payment.publisher.ts` — mirror `cash-from-payment.publisher.ts`; publish payload / dòng thanh toán DEPOSIT.
- `apps/api/src/modules/accounting/deposit/consumers/pos-deposit-sale.consumer.ts` — mirror `cash-voucher-consumers/pos-cash-sale.consumer.ts`; `@OnDomainEvent(ERP_TOPICS.DEPOSIT_VOUCHER_NEEDED_POS_SALE)` → `DepositService.createAndPostInternal()`. `wrapWithIdempotency` (`processed_events`) + DB unique index.
- `packages/shared-kafka-client/src/topics.ts` — thêm `DEPOSIT_VOUCHER_NEEDED_POS_SALE: 'erp.deposit.movement.from.payment'` vào `ERP_TOPICS` (topic tạo bởi `TopicInitializer` khi app start).
- `apps/api/src/modules/pos/services/checkout-invoice.service.ts` — thêm nhánh non-cash **cạnh** block CASH hiện có (sau L370), sau khi tx checkout commit. Inject `DepositFromPaymentPublisher` + `DepositRoutingService`.
- Wire publisher/consumer/routing-service providers vào module tương ứng (`AccountingModule`/`PosModule` imports).

## Acceptance Criteria

- [ ] Sau commit tx checkout: `savedPayments.filter(p => p.paymentMethod !== InvoicePaymentMethod.CASH)`; mỗi dòng gọi `resolveDepositTarget(...)` với COA đã resolve `p.accountId`; **chỉ** dòng `fund = DEPOSIT` mới publish (BR-MAP-01 tách per line).
- [ ] Publish payload carry đủ để dedupe + post: `invoiceId`, `invoicePaymentId`, `invoiceCode`, `depositAccountId` (resolved), `bankAccountId` = `p.accountId` (COA 112x đã resolve trên `invoice_payments`), `contraAccountId` (= revenue account như block cash), `amount`, `reference`, `cardType`, `branchId`, `docDate`.
- [ ] `PosDepositSaleConsumer` gọi `DepositService.createAndPostInternal(POS_SALE bank receipt)` với `source = POS_INVOICE`, `source_ref_id = invoiceId`, `source_ref_line_id = invoicePaymentId`, `type = DEPOSIT`, `recon_status = CHUA`.
- [ ] **BR-POS-01 / R3 / UAT-03 (idempotent)**: replay/retry cùng `(POS_INVOICE, invoiceId, invoicePaymentId)` → INSERT thứ 2 dính unique index `uniq_deposit_movements_source_ref` → consumer nuốt `duplicate key` (no-op), **đúng 1** movement. `eventId` random → **DB unique index là guard thật**, không dựa app check.
- [ ] **BR-POS-02 / R4**: movement/JE auto từ POS `affect_revenue` = **false, khóa cứng** — doanh thu đã ghi ở hóa đơn; consumer không cho set true.
- [ ] **BR-POS-03**: movement `source = POS_INVOICE` không cho sửa/xóa thủ công (chặn ở CRUD/service; điều chỉnh phải qua hủy/hoàn hóa đơn — bút toán đảo, GĐ3).
- [ ] `recon_status` mặc định `CHUA`; số dư `deposit_account.balance` tăng đúng `amount` (nền UAT-01).
- [ ] **NFR-04 at-least-once + idempotent**: mất/ restart broker không mất giao dịch (retry), replay không tạo trùng. `doc_date` = ngày giao dịch gốc (BR-POS-04 — không phải ngày đồng bộ).
- [ ] Publish nằm **sau** commit tx checkout (không publish trong tx bán hàng → không mồ côi khi rollback), mirror vị trí block cash.
- [ ] Auto-post **không** làm fail checkout: publish lỗi/consumer lỗi → log + retry/DLQ (`modules/events/`), hóa đơn vẫn `COMPLETED`; resolver thiếu default account (BR-ACC-03) → message vào DLQ chờ xử lý, không rollback sale.
- [ ] Scope: movement mang `organizationId` + `branchId` của hóa đơn; không leak cross-branch (UAT-13).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: non-cash publish per line, cash không publish qua topic deposit, split payment tách quỹ, replay ×N → 1 movement, affect_revenue locked false.
- [ ] Không đổi schema ngoài TKT-DF-01; `synchronize` giữ false.
- [ ] Endpoint/topic đổi → openapi regen ở TKT-DF-08.
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

Hook đặt **ngay sau** block cash hiện có (`checkout-invoice.service.ts` L341-370). Block cash filter
`p.paymentMethod === InvoicePaymentMethod.CASH` → `cashFromPaymentPublisher.publish`. Nhánh non-cash đối xứng:

```ts
// Sau block cashPayments (L370). Publish per NON-cash deposit-mapped line — after tx commit.
const nonCashPayments = savedPayments.filter(
  (p) => p.paymentMethod !== InvoicePaymentMethod.CASH,
);
for (const p of nonCashPayments) {
  const target = await this.depositRouting.resolveDepositTarget(
    {
      paymentMethod: p.paymentMethod,
      cardType: p.cardType ?? null,       // GĐ1 luôn null (invoice_payments chưa có cardType)
      resolvedAccountId: p.accountId,     // COA 112x đã resolve trên invoice_payments — khóa suy ra quỹ
      branchId: updatedInvoice.branchId,
      docDate: updatedInvoice.docDate,    // BR-POS-04 doc_date gốc
    },
    actor,
  );
  if (target.fund !== TargetFund.DEPOSIT) continue; // chỉ dòng khớp quỹ tiền gửi (COA-derived); OTHER bỏ qua
  await this.depositFromPaymentPublisher.publish(
    {
      invoiceId: updatedInvoice.id,
      invoicePaymentId: p.id,          // → source_ref_line_id (dedupe grain)
      invoiceCode: realCode,
      depositAccountId: target.depositAccountId!,
      bankAccountId: p.accountId,      // resolved bank COA 112x (debit)
      contraAccountId: revenueAccountId, // như block cash (credit)
      amount: Number(p.amount),
      reference: p.reference,
      cardType: p.cardType ?? null,
      branchId: updatedInvoice.branchId,
      docDate: updatedInvoice.docDate,
    },
    actor,
  );
}
```

Consumer (mirror `pos-cash-sale.consumer.ts`, wrap idempotency):

```ts
@Injectable()
export class PosDepositSaleConsumer {
  @OnDomainEvent(ERP_TOPICS.DEPOSIT_VOUCHER_NEEDED_POS_SALE)
  async handle(evt: DepositFromPaymentEvent) {
    await this.consumerManager.wrapWithIdempotency(evt, async () => {
      try {
        await this.depositService.createAndPostInternal({
          source: DepositMovementSource.POS_INVOICE,
          sourceRefId: evt.invoiceId,
          sourceRefLineId: evt.invoicePaymentId, // UNIQUE(source, ref, line) — R3/BR-POS-01
          type: DepositMovementType.DEPOSIT,
          depositAccountId: evt.depositAccountId,
          contraAccountId: evt.contraAccountId,
          amount: evt.amount,
          docDate: evt.docDate,
          reconStatus: ReconStatus.CHUA,
          affectRevenue: false,          // BR-POS-02 HARD-LOCKED
          reference: evt.reference,
        }, evt.actor);
      } catch (e) {
        if (isUniqueViolation(e, 'uniq_deposit_movements_source_ref')) return; // replay no-op
        throw e; // retry / DLQ
      }
    });
  }
}
```

`invoice_payments.account_id` = COA bank đã resolve (per shared context); `paymentMethod` enum `cash|bank_transfer|card`
(`invoice.entity.ts` L13-16). Topic string mới `'erp.deposit.movement.from.payment'` — không đụng chuỗi cash topic.

## Testing Strategy

- **Unit** (`pos-deposit-sale.consumer.spec.ts`): happy → 1 `createAndPostInternal` call; unique violation → nuốt (no rethrow); lỗi khác → rethrow (retry). `affect_revenue` luôn false.
- **Unit** (`deposit-from-payment.publisher.spec.ts` / checkout hook spec): non-cash line publish; cash line không publish deposit; split → chỉ dòng DEPOSIT publish; carry đúng `invoicePaymentId`/`docDate`.
- **E2E** (TKT-DF-11): UAT-01 (1 non-cash → 1 movement CHUA, balance+), UAT-02 (split cash+transfer → 2 quỹ), **UAT-03 (replay ×3 → 1 movement)**.

## Dependencies

- Depends on: TKT-DF-04 (`resolveDepositTarget`), TKT-DF-03 (`DepositService.createAndPostInternal`).
- Blocks: TKT-DF-08 (openapi/topic), TKT-DF-11 (E2E UAT-01/02/03).
