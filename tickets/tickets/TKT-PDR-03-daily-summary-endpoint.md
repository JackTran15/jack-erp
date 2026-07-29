# TKT-PDR-03 BE: endpoint POST /reports/pos/daily-summary

## Epic

[EPIC-27072026 Báo cáo theo ngày (POS Daily Report)](../epics/EPIC-27072026-pos-daily-report.md)

## Summary

Endpoint tổng hợp 1 khoảng thời gian cho tab "Tổng hợp": trả 1 object `PosDailySummaryResult` gồm Thu / Chi / Công nợ / Hàng bán / Hàng trả / KHÁC. KHÔNG dùng report-type engine (output không phải `ReportRow[]`); dùng module con + CQRS query/handler, tính trong JS. Không entity/migration mới.

## Deliverables

- `apps/api/src/modules/reporting/pos-daily-report/pos-daily-report.controller.ts` — `@Controller('reports/pos')`, `@UseGuards(AuthGuard, PermissionGuard)`, `@RequirePermission('reporting.invoice.branch.read')`, `@Actor()`. `POST /daily-summary` → `queryBus.execute(new GetPosDailySummaryQuery(dto, actor))`.
- `apps/api/src/modules/reporting/pos-daily-report/dto/pos-daily-summary.dto.ts` — `issuedAt: DateRangeFilterDto` (tái dùng `common/filters/filter.dto.ts`, from–to), `branchId?`, `cashierId?`, `salespersonId?`, `invoiceStatus?: string[]` (class-validator + `@ApiProperty`, whitelist).
- `apps/api/src/modules/reporting/pos-daily-report/queries/get-pos-daily-summary.query.ts` + `get-pos-daily-summary.handler.ts` — `@QueryHandler`, inject repo: `InvoiceEntity`, `InvoiceItemEntity`, `InvoicePaymentEntity`, `InvoicePromotionEntity`, `InvoiceDebtEntity`, `DebtPaymentEntity`, `CashPaymentEntity`, `RbacService` (+ cash receipts entity cho Thu refund nếu cần).
- `apps/api/src/modules/reporting/pos-daily-report/pos-daily-report.module.ts` — `TypeOrmModule.forFeature([...])` + `CqrsModule` + `RbacModule`; import vào `reporting.module.ts`.
- Trả type `PosDailySummaryResult` (TKT-PDR-01).

## Acceptance Criteria

- [ ] Scope: mọi query invoice filter `invoice.organizationId = actor.organizationId` + `applyBranchScope` (branch của actor; pos-web single-branch, bỏ consolidated). `cash_payments`/`invoice_debts`/`debt_payments` scope org+branch qua `applyBranchScope`.
- [ ] `cashierId` (`staffId`) / `salespersonId` chỉ áp cho query có invoice (Thu, Hàng bán/trả, KHÁC); Chi & Công nợ KHÔNG áp (comment rõ).
- [ ] **Thu:** `Σ InvoicePayment.amount*sign` group `paymentMethod` (cash/card/bank_transfer); Voucher = `Σ InvoicePromotion.discountAmount*sign` (promotionType='voucher'); Điểm = `Σ pointsDiscountAmount*sign`; refund tiền mặt net đúng (tái dùng logic `daily-sales-summary`). `thu.total = cash+card+atm+transfer+voucher+points`. ATM: nếu enum không có type ATM riêng → `atm=0` + comment.
- [ ] **Chi:** `cash_payments` `status=POSTED`, `voucherDate` trong cửa sổ, chia `cash`/`transfer` theo `cashAccountId`; gồm phần âm phiếu refund. `chi.total = cash+transfer`.
- [ ] **Công nợ:** `ghiNo = Σ invoice_debts.originalAmount` (credit invoice, trong cửa sổ); `giamNo = Σ debt_payments.amount` (paidAt trong cửa sổ).
- [ ] **Hàng bán/trả:** từ `invoice_items` các invoice trong cửa sổ — Bán `direction=OUT` (Σ quantity, Σ lineTotal); Trả `direction=IN`.
- [ ] **KHÁC:** đếm invoice theo `type` (SALE/RETURN/EXCHANGE) + `totalInvoices`; `voucherCount` từ invoice_promotions; `promoCodeCount`/`cardReceiptCount` = 0 (TODO comment) trừ khi định nghĩa được `cardReceiptCount` = số dòng payment card.
- [ ] `thuTruChi = thu.total - chi.total`.
- [ ] `applyInvoiceStatusFilter` mặc định loại `cancelled`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- pos-daily-summary` xanh (handler spec).
- [ ] `pnpm --filter @erp/api lint` xanh; route đăng ký (Nest log).
- [ ] Không schema change; `synchronize` false.
- [ ] No Vietnamese trong source; không TODO ngoài các chỗ KHÁC counts đã nêu.

## Tech Approach

```ts
@QueryHandler(GetPosDailySummaryQuery)
export class GetPosDailySummaryHandler {
  async execute({ dto, actor }: GetPosDailySummaryQuery): Promise<PosDailySummaryResult> {
    const branchIds = resolveBranchIds(false, undefined, dto.branchId, actor);
    const inv = this.invoiceRepo.createQueryBuilder('invoice')
      .where('invoice.organizationId = :org', { org: actor.organizationId });
    applyBranchScope(inv, 'invoice', branchIds);
    applyInvoiceStatusFilter(inv, 'invoice', dto);
    new FilterBuilder(inv).applyDateRange('invoice.issuedAt', dto.issuedAt);
    if (dto.cashierId) inv.andWhere('invoice.staffId = :c', { c: dto.cashierId });
    if (dto.salespersonId) inv.andWhere('invoice.salespersonId = :s', { s: dto.salespersonId });
    const invoices = await inv.getMany();
    // ... load payments/promotions/items by invoiceIds; cash_payments by voucherDate; debts/payments by window
    // ... compute Thu / Chi / CôngNợ / Hàng / KHÁC in JS
  }
}
```
_(Chi query dùng `voucherDate` (date column) trực tiếp, KHÔNG `applyDateRange('invoice.issuedAt')`. Đọc kỹ cơ chế phiếu refund để chia +/- và cash/transfer.)_

## Testing Strategy

- Unit (`get-pos-daily-summary.handler.spec.ts`): seed invoices SALE/RETURN/EXCHANGE + payments + 1 debt + 1 debt-payment + 1 cash_payment (gồm refund); assert từng nhóm + sign + branch scope + không leak org khác.
- E2E ở TKT-PDR-09.

## Dependencies

- Depends on: TKT-PDR-01
- Blocks: TKT-PDR-04
