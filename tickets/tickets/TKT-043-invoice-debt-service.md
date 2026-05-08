# TKT-043 InvoiceDebt + DebtPayment entities & debt flow

## Epic

[EPIC-007 POS Invoice, Customer Loyalty & Promotions](../epics/EPIC-007-pos-invoice-customer-promotions.md)

## Summary

Tạo entities `InvoiceDebtEntity` và `DebtPaymentEntity`, migration, và `InvoiceDebtService` xử lý bán công nợ và thu nợ. Đây là service được gọi từ `CheckoutInvoiceService` (TKT-040) khi `payment_method=debt`.

## Deliverables

- 1 migration file: `1778300000000-AddInvoiceDebtAndDebtPayments.ts`
- `InvoiceDebtEntity` (`modules/pos/entities/invoice-debt.entity.ts`)
- `DebtPaymentEntity` (`modules/pos/entities/debt-payment.entity.ts`)
- `InvoiceDebtService` (`modules/pos/services/invoice-debt.service.ts`)
- Endpoints: xem công nợ khách hàng, thu nợ, lịch sử thanh toán nợ
- Enum: `DebtStatus` (`open | paid | overdue`), `DebtDocumentType` (`credit_invoice | payment_receipt | adjustment`)

## Implementation Status

✅ **COMPLETED** — 2026-05-07

Files delivered:
- `apps/api/src/modules/pos/entities/invoice-debt.entity.ts` — enums `DebtStatus`, `DebtDocumentType`
- `apps/api/src/modules/pos/entities/debt-payment.entity.ts` — enum `DebtPaymentMethod`
- `apps/api/src/modules/pos/services/invoice-debt.service.ts`
- `apps/api/src/modules/pos/controllers/invoice.controller.ts` — debt endpoints
- `apps/api/src/modules/pos/services/invoice-debt.service.spec.ts` — 16 unit tests

## Acceptance Criteria

- [x] `createFromInvoice()` được gọi bởi CheckoutService trong cùng transaction — tạo `invoice_debt` với `original_amount = invoice.amount_due`.
- [x] `GET /invoices/customers/:customerId/debts` trả danh sách công nợ, filter `status`.
- [x] `POST /invoices/debts/:debtId/payments` thu nợ: INSERT `debt_payment` + decrement `remaining_amount` trong 1 transaction.
- [x] Khi `remaining_amount = 0`: tự động `status → paid`, `settled_at = NOW()`.
- [x] Không cho thu nợ vượt quá `remaining_amount`.
- [x] `GET /invoices/debts/:debtId/payments` lịch sử thu nợ.
- [x] `customer_id` là REQUIRED khi tạo invoice_debt.

## Definition of Done

- [x] PR có migration + entities + service + endpoints; pass CI lint + build + unit tests.
- [x] Unit test: createFromInvoice, thu một phần, thu đủ → paid, thu vượt → 400.
- [x] Atomicity test: mock lỗi sau INSERT debt_payment → verify remaining_amount không thay đổi.

## Tech Approach

### `invoice_debts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | from BaseEntity |
| `branch_id` | uuid | from BaseEntity — chi nhánh phát sinh nợ |
| `reference_code` | varchar | = `invoice.code` — hiển thị |
| `invoice_id` | uuid FK | → invoices (UNIQUE 1:1) |
| `customer_id` | uuid FK | → customers — NOT NULL |
| `document_type` | enum | `credit_invoice \| payment_receipt \| adjustment` |
| `original_amount` | decimal(18,2) | = `invoice.amount_due` lúc tạo |
| `paid_amount` | decimal(18,2) | tích lũy |
| `remaining_amount` | decimal(18,2) | = original − paid |
| `issued_at` | date | |
| `due_date` | date | nullable |
| `settled_at` | timestamptz | nullable |
| `status` | enum | `open \| paid \| overdue` |
| `note` | text | nullable |

### `debt_payments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | |
| `debt_id` | uuid FK | → invoice_debts |
| `amount` | decimal(18,2) | số tiền thu |
| `payment_method` | enum | `cash \| bank_transfer` |
| `staff_id` | uuid FK | → users — nhân viên thu nợ |
| `paid_at` | timestamptz | |
| `note` | text | nullable |

### Thu nợ atomic flow

```typescript
await dataSource.transaction(async (em) => {
  const debt = await em.findOneOrFail(InvoiceDebtEntity, { where: { id } });
  if (amount > debt.remainingAmount) throw new BadRequestException('Vượt quá số nợ còn lại');
  await em.insert(DebtPaymentEntity, { debtId: id, amount, ... });
  debt.paidAmount += amount;
  debt.remainingAmount -= amount;
  if (debt.remainingAmount === 0) {
    debt.status = DebtStatus.PAID;
    debt.settledAt = new Date();
  }
  await em.save(debt);
});
```

## Testing Strategy

- Unit: mock transaction; test thu một phần, thu đủ, thu vượt.
- Integration: checkout invoice → debt → thu nợ → verify status.

## Dependencies

- Requires: TKT-038 (InvoiceEntity — FK invoice_debts.invoice_id).
- Required by: TKT-040 (CheckoutService gọi `createFromInvoice`).
- Blocks: (none — standalone sau TKT-040).
