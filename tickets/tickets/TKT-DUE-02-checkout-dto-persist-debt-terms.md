# TKT-DUE-02 Checkout DTO + lưu dueDate/creditDays trên invoice_debts

## Epic

[EPIC-16062026 POS công nợ — Hạn thanh toán](../epics/EPIC-16062026-pos-debt-due-date.md)

## Summary

Cho phép checkout nhận `dueDate` + `creditDays` (do thu ngân nhập per-invoice trong modal) và lưu vào dòng `invoice_debts` được tạo khi `remainder > 0`. Hiện `InvoiceDebtService.createFromInvoice()` không set `dueDate` (luôn NULL). Ticket này thêm field DTO, truyền qua `CheckoutInvoiceService` → `createFromInvoice`, set `due_date` + `credit_days`. Chỉ áp dụng khi có công nợ (`remainder > 0`); checkout PAID không tạo debt nên bỏ qua.

## Deliverables

- `apps/api/src/modules/pos/dto/checkout-invoice.dto.ts` — thêm `dueDate?: string` + `creditDays?: number` vào `CheckoutInvoiceDto` (class-validator + `@ApiProperty`).
- `apps/api/src/modules/pos/services/checkout-invoice.service.ts` — truyền `{ dueDate, creditDays }` xuống `createFromInvoice(...)` khi `remainder > 0` (`checkout-invoice.service.ts:~227`).
- `apps/api/src/modules/pos/services/invoice-debt.service.ts` — `createFromInvoice` nhận thêm tham số `debtTerms?: { dueDate?: string | null; creditDays?: number | null }`, set lên entity với suy diễn (xem Tech Approach).

## Acceptance Criteria

- [ ] `CheckoutInvoiceDto` khai báo đủ `dueDate` (ISO `YYYY-MM-DD`, optional) + `creditDays` (int ≥ 0, optional) — global `whitelist:true` không strip.
- [ ] Checkout với `{ dueDate, creditDays }` + công nợ → dòng `invoice_debts` có `due_date` + `credit_days` đúng giá trị gửi.
- [ ] Checkout không gửi due date (full debt cũ) → `due_date`/`credit_days` NULL (hành vi cũ giữ nguyên).
- [ ] `dueDate < issuedAt` → `400` (`BadRequestException`, message English).
- [ ] Mọi truy vấn scope `actor.organizationId` + `branchId`; không rò cross-tenant.
- [ ] Mutation idempotent (kế thừa `IdempotencyInterceptor`; replay cùng key + body → cùng response).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Service spec phủ: set dueDate+creditDays, chỉ creditDays (suy ra dueDate), chỉ dueDate (suy ra creditDays), không gửi (NULL), dueDate<issuedAt (400).
- [ ] No Vietnamese trong source (error/Swagger/comment English).
- [ ] OpenAPI regen để ở TKT-DUE-05 (không regen rời rạc ở đây).

## Tech Approach

DTO:

```ts
export class CheckoutInvoiceDto {
  @ApiProperty({ type: [InvoicePaymentLineDto] })
  @ValidateNested({ each: true })
  @Type(() => InvoicePaymentLineDto)
  payments: InvoicePaymentLineDto[];

  @ApiPropertyOptional({
    description: 'Credit due date (ISO YYYY-MM-DD). Stored on the debt when the sale is on credit.',
    example: '2026-06-25',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Credit term in days entered at checkout.', example: 9 })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditDays?: number;
}
```

`createFromInvoice` — suy diễn dueDate/creditDays (FE thường gửi cả hai; vẫn xử lý khi chỉ có một):

```ts
async createFromInvoice(
  invoice: InvoiceEntity,
  debtAmount?: number,
  manager?: EntityManager,
  debtTerms?: { dueDate?: string | null; creditDays?: number | null },
): Promise<InvoiceDebtEntity> {
  const today = new Date().toISOString().split('T')[0]; // issuedAt
  // dueDate ưu tiên giá trị gửi; nếu chỉ có creditDays → today + creditDays
  let dueDate = debtTerms?.dueDate ?? null;
  let creditDays = debtTerms?.creditDays ?? null;
  if (!dueDate && creditDays != null) dueDate = addDaysIso(today, creditDays);
  if (dueDate && creditDays == null) creditDays = daysBetween(today, dueDate);
  if (dueDate && dueDate < today) {
    throw new BadRequestException('dueDate must be on or after the issue date');
  }
  const debtData: Partial<InvoiceDebtEntity> = {
    /* ...existing fields... */
    issuedAt: today,
    dueDate,
    creditDays,
    status: DebtStatus.OPEN,
  };
  // ...persist as today...
}
```

> `addDaysIso`/`daysBetween` là helper string-date thuần (không `Date.now()` magic) — đặt local trong service hoặc `pos` utils.

## Testing Strategy

- Unit `invoice-debt.service.spec.ts`: 5 nhánh ở Acceptance + idempotency replay (cùng invoice → không tạo trùng debt).
- Tích hợp với checkout ở E2E (TKT-DUE-08).

## Dependencies

- Depends on: TKT-DUE-01 (cột `credit_days`).
- Blocks: TKT-DUE-05, TKT-DUE-08.
