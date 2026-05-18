# TKT-073 Checkout-return service & API endpoints

## Epic

[EPIC-011 POS Return & Exchange](../epics/EPIC-011-pos-return-exchange.md)

## Summary

Core finalize service: `CheckoutReturnService.checkout()` orchestrate DB transaction + fan-out events theo 4 sequence diagram trong [plan-return-exchange.md](../../docs/plan-return-exchange.md#sequence-diagrams). Cộng thêm DTOs, 4 controller endpoint, module wiring cuối cùng.

Refs: [plan Step 8 - checkout-return.service](../../docs/plan-return-exchange.md#step-8--services-new), [Step 9](../../docs/plan-return-exchange.md#step-9--controllers--dtos), [Step 10](../../docs/plan-return-exchange.md#step-10--module-wiring).

## Deliverables

### Service

- `apps/api/src/modules/pos/services/checkout-return.service.ts` — mirror `CheckoutInvoiceService.checkout()` nhưng đảo direction, gọi return publishers.

### DTOs

- `apps/api/src/modules/pos/dto/create-return-invoice.dto.ts`
- `apps/api/src/modules/pos/dto/create-exchange-invoice.dto.ts`
- `apps/api/src/modules/pos/dto/checkout-return.dto.ts`

### Controller (`apps/api/src/modules/pos/controllers/invoice.controller.ts`)

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/invoices/:id/eligible-returns` | `pos.return.create` | — |
| POST | `/invoices/returns` | `pos.return.create` | `CreateReturnInvoiceDto` |
| POST | `/invoices/exchanges` | `pos.exchange.create` | `CreateExchangeInvoiceDto` |
| POST | `/invoices/:id/checkout-return` | `pos.return.create` hoặc `pos.exchange.create` (theo `type`) | `CheckoutReturnDto` |

### Module wiring

- `pos.module.ts` — register `CheckoutReturnService`, `CreateReturnInvoiceService`, `CreateExchangeInvoiceService`, `ReturnEligibilityService`, 2 publisher mới.
- `customer.module.ts`, `inventory.module.ts`, `accounting.module.ts` — wiring đã có ở TKT-070 và TKT-071, kiểm tra import chain.
- Export `CustomerCreditService` từ `customer.module` để `pos.module` có thể inject.

## Acceptance Criteria

### Service behavior

- [ ] Validate `invoice.isDraft = true`, `type ∈ {RETURN, EXCHANGE}` — else 400.
- [ ] Compute `returnSubtotal` (sum lineTotal where `direction=IN`), `newSubtotal` (where `direction=OUT`), `netAmount = newSubtotal - returnSubtotal`, `refundedAmount = max(returnSubtotal - newSubtotal, 0)`.
- [ ] Validate `refundMethod × netAmount` matrix:
  - `netAmount > 0` → require `dto.payments` sum = `netAmount` (reuse existing logic).
  - `netAmount < 0` → require `refundMethod ∈ {CASH, STORE_CREDIT}`.
  - `netAmount = 0` → require `refundMethod = OFFSET`, no payments.
- [ ] Validate `refundMethod` × original invoice status (e.g. `OFFSET` chỉ khi original có DEBT remaining hoặc EXCHANGE thuần swap).
- [ ] Generate code via `DocumentNumberingService.generate(DocumentType.RETURN, ...)`.

### Transaction body (single `manager.transaction`)

- [ ] `UPDATE invoices SET status=PAID, issuedAt, code, refundMethod, refundedAmount, netAmount`.
- [ ] **Atomic** `UPDATE invoice_items SET returned_quantity = returned_quantity + :delta WHERE id=:origItemId AND returned_quantity + :delta <= quantity`; assert `rowsAffected = 1` else throw `ConflictException`.
- [ ] Save `InvoicePayment` rows chỉ khi `netAmount > 0`.
- [ ] If `refundMethod = STORE_CREDIT`: `customerCreditService.issue(invoice, refundedAmount, manager)`.
- [ ] If `refundMethod = OFFSET` + original status ∈ {DEBT, PARTIAL_DEBT}: `invoiceDebtService.settle(originalInvoiceId, refundedAmount, manager)`.
- [ ] If `refundMethod = OFFSET` + EXCHANGE thuần swap (`refundedAmount=0`): pass-through, no settle.

### Fan-out events (after commit, parallel)

- [ ] `stockReturnInPublisher.publish` — luôn (cả RETURN và EXCHANGE).
- [ ] `stockDeductionPublisher.publish` — chỉ EXCHANGE có new lines.
- [ ] `journalReturnPublisher.publish` — luôn.
- [ ] `cashRefundPublisher.publish` — chỉ khi `refundMethod = CASH`.
- [ ] `cashFromPaymentPublisher.publish` — chỉ EXCHANGE `netAmount > 0` với cash payments (reuse existing).
- [ ] `loyaltyPointsReversePublisher.publish` (RETURN hoặc EXCHANGE net ≤ 0) HOẶC `loyaltyPointsPublisher.publish` (EXCHANGE net > 0 — KH earn thêm theo net delta).
- [ ] `returnPostedPublisher.publish` (`RETURN_POSTED`).
- [ ] `wsEmitter.emitToBranch(POS_CHECKOUT_ACKNOWLEDGED, { type: 'RETURN' | 'EXCHANGE' })`.

### Controller

- [ ] All 4 endpoint pass class-level guards `@UseGuards(AuthGuard, PermissionGuard)`.
- [ ] DTO validate `forbidNonWhitelisted` (reject extra field — global pipe đã set).
- [ ] OpenAPI doc đầy đủ `@ApiProperty`, `@ApiResponse` cho 4 endpoint.

## Definition of Done

- [ ] Spec test `checkout-return.service.spec.ts` ≥ 15 case (xem list dưới Testing Strategy).
- [ ] OpenAPI snapshot regenerate (`pnpm openapi:generate`).
- [ ] Manual smoke: chạy đủ 4 sequence diagram qua Swagger UI / Postman.

## Tech Approach

### DTO shapes

```ts
// CreateReturnInvoiceDto
{
  mode: 'quick' | 'regular';
  originalInvoiceId?: string; // required if regular
  customerId?: string;
  sessionId: string;
  reason: string;
  lines: Array<{
    originalInvoiceItemId?: string; // required if regular
    itemId: string;
    locationId: string;
    quantity: string;
    unitPrice: string;
  }>;
}

// CreateExchangeInvoiceDto
{
  sessionId: string;
  originalInvoiceId: string;
  reason: string;
  customerId?: string;
  returnLines: ReturnInvoiceLineDto[];
  newLines: InvoiceItemInputDto[]; // reuse SALE shape
}

// CheckoutReturnDto
{
  refundMethod: 'CASH' | 'STORE_CREDIT' | 'OFFSET';
  revenueAccountId: string;
  cashAccountId?: string;       // required if CASH + no active session
  receivableAccountId?: string; // required if OFFSET against debt
  creditLiabilityAccountId?: string; // required if STORE_CREDIT
  creditExpiresAt?: string;     // ISO date, only STORE_CREDIT
  payments?: InvoicePaymentLineDto[]; // only EXCHANGE net > 0
}
```

### Service outline

```ts
@Injectable()
export class CheckoutReturnService {
  async checkout(id: string, dto: CheckoutReturnDto, actor: ActorContext): Promise<InvoiceEntity> {
    const invoice = await this.loadDraft(id, actor);
    this.assertDraftAndType(invoice);
    const { returnSubtotal, newSubtotal, netAmount, refundedAmount } = this.computeTotals(invoice);
    this.validateRefundMatrix(dto, netAmount, refundedAmount, invoice);
    const code = await this.numbering.generate(DocumentType.RETURN, invoice.branchId, actor);

    const posted = await this.dataSource.transaction(async manager => {
      await this.updateInvoice(manager, invoice, code, dto, refundedAmount, netAmount);
      await this.guardReturnedQuantity(manager, invoice);
      if (netAmount > 0) await this.savePayments(manager, invoice, dto.payments!);
      if (dto.refundMethod === RefundMethod.STORE_CREDIT) {
        await this.customerCredit.issue(invoice, refundedAmount, manager);
      }
      if (dto.refundMethod === RefundMethod.OFFSET && this.isDebt(invoice.originalInvoice!)) {
        await this.invoiceDebt.settle(invoice.originalInvoiceId!, refundedAmount, manager);
      }
      return manager.findOneOrFail(InvoiceEntity, { where: { id }, relations: { items: true } });
    });

    await this.fanOutEvents(posted, dto, netAmount, refundedAmount, actor);
    return posted;
  }
}
```

### Atomic returned_quantity guard

```ts
for (const line of returnLines) {
  const result = await manager.query(
    `UPDATE invoice_items
     SET returned_quantity = returned_quantity + $1
     WHERE id = $2 AND returned_quantity + $1 <= quantity`,
    [line.quantity, line.originalInvoiceItemId],
  );
  // PG raw returns [rows, rowCount]
  if (result[1] !== 1) {
    throw new ConflictException(`Vượt quá số lượng có thể trả cho line ${line.originalInvoiceItemId}`);
  }
}
```

## Testing Strategy

Mirror `checkout-invoice.service.spec.ts` (~19KB). Specific case checklist:

- Not-a-draft / wrong type → 400.
- No items / missing refund accounts → 400.
- **RETURN + CASH happy**: assert publishers + atomic UPDATE returnedQuantity.
- **STORE_CREDIT**: `customer_credits` row created, no `CASH_REFUND` published.
- **OFFSET vs DEBT invoice**: `invoiceDebt.settle` invoked, no cash event.
- **EXCHANGE net > 0**: require payments, both stock publishers fire, `CASH_MOVEMENT_FROM_PAYMENT`.
- **EXCHANGE net < 0**: both stock publishers + `CASH_REFUND`.
- **EXCHANGE net = 0**: no payments, no cash refund, OFFSET only.
- **Concurrency**: 2 returns đồng thời cùng original line → second throws `ConflictException`.
- **Loyalty**: floor 0 khi card.points không đủ.
- **WebSocket emit**: payload có `type: 'RETURN'` hoặc `'EXCHANGE'`.

## Dependencies

- Phụ thuộc: [TKT-070](./TKT-070-return-publishers-and-consumers.md) (publishers), [TKT-071](./TKT-071-customer-credit-service.md) (customer credit), [TKT-072](./TKT-072-return-eligibility-and-draft-services.md) (draft services + shared helpers).
- Blocks: [TKT-074](./TKT-074-return-exchange-test-plan.md) (e2e test).
