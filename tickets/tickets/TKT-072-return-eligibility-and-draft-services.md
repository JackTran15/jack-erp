# TKT-072 Return eligibility & draft creation services

## Epic

[EPIC-011 POS Return & Exchange](../epics/EPIC-011-pos-return-exchange.md)

## Summary

3 service xử lý phase **create draft** trong flow return/exchange + extract shared checkout helpers (chuẩn bị cho `CheckoutReturnService` ở TKT-073).

Refs: [plan Step 5](../../docs/plan-return-exchange.md#step-5--extract-shared-checkout-helpers), [Step 8 partial](../../docs/plan-return-exchange.md#step-8--services-new).

## Deliverables

### Shared helpers (Step 5)

- `apps/api/src/modules/pos/services/checkout-shared.ts`:
  - `computeInvoiceTotals(items, discount, deposit) → { subtotal, amountDue }`
  - `assertAllItemsHaveLocation(items, invoiceId)`
  - `roundMoney(v: number | string) → number`
  - `findActiveDrawerSession(sessionRepo, actor) → PosSessionEntity | null`
- Refactor `checkout-invoice.service.ts` để dùng helpers (pure mechanical, không đổi behavior).

### Services

- `apps/api/src/modules/pos/services/return-eligibility.service.ts`:
  - `getEligibleLines(originalInvoiceId, actor) → EligibleLineDto[]`
  - `assertLineEligible(originalInvoiceItemId, qty, actor) → void`
- `apps/api/src/modules/pos/services/create-return-invoice.service.ts`:
  - `create(dto: CreateReturnInvoiceDto, actor) → InvoiceEntity (draft, type=RETURN)`
- `apps/api/src/modules/pos/services/create-exchange-invoice.service.ts`:
  - `create(dto: CreateExchangeInvoiceDto, actor) → InvoiceEntity (draft, type=EXCHANGE)`

### Tests

- 4 co-located `.spec.ts` (mỗi service một spec).

## Acceptance Criteria

### `checkout-shared.ts`
- [ ] 4 helper pure (không inject), import được từ cả hai checkout service.
- [ ] `checkout-invoice.service.spec.ts` vẫn pass sau refactor (zero behavior change).

### `ReturnEligibilityService`
- [ ] Trả về line shape: `{ originalInvoiceItemId, itemId, itemName, soldQuantity, returnedQuantity, maxReturnable, unitPrice, lineDiscount }`.
- [ ] `maxReturnable = soldQuantity - returnedQuantity` (≥ 0).
- [ ] Filter org scope từ `actor.organizationId`; cross-org access → `NotFoundException`.
- [ ] Throw nếu original invoice không phải `type=SALE` hoặc status ∉ {PAID, PARTIAL_DEBT, DEBT}.

### `CreateReturnInvoiceService`
- [ ] `mode='quick'`: bỏ qua eligibility, items tự do với `direction=IN`, không set `originalInvoiceId`.
- [ ] `mode='regular'`: gọi `ReturnEligibilityService` validate từng line, set `originalInvoiceItemId` + `originalInvoiceId`. Throw 400 nếu `quantity > maxReturnable`.
- [ ] Output: `InvoiceEntity` với `type=RETURN`, `isDraft=true`, `code='DRAFT-<short-uuid>'`.
- [ ] Reuse catalog/location resolver hiện hữu của `InvoiceService` cho quick mode.

### `CreateExchangeInvoiceService`
- [ ] Input gồm `returnLines` (regular validation logic) + `newLines` (catalog/location validation như SALE).
- [ ] Save items: returnLines `direction=IN`, newLines `direction=OUT`.
- [ ] Type = `EXCHANGE`, `originalInvoiceId` required.
- [ ] Validation fail nửa chừng → không tạo invoice (entire create trong single transaction).

## Definition of Done

- [ ] Spec coverage: mỗi service ≥ 6 case (happy + edge + error).
- [ ] `checkout-invoice.service.spec.ts` regression pass.
- [ ] Co-author review confirm Step 5 là pure mechanical refactor (không thay đổi behavior SALE checkout).

## Tech Approach

### Extract pattern (Step 5)

Trước extract (`checkout-invoice.service.ts` lines 87–94):
```ts
const missingLoc = items.find(i => !i.locationId);
if (missingLoc) {
  throw new BadRequestException(`Missing location for item ${missingLoc.itemId}`);
}
```

Sau:
```ts
import { assertAllItemsHaveLocation } from './checkout-shared';
assertAllItemsHaveLocation(items, invoice.id);
```

Tương tự cho `findActiveDrawerSession` (lines 225–231 hiện tại).

### `EligibleLineDto` shape

```ts
export class EligibleLineDto {
  originalInvoiceItemId!: string;
  itemId!: string;
  itemName!: string;
  soldQuantity!: string;
  returnedQuantity!: string;
  maxReturnable!: string;
  unitPrice!: string;
  lineDiscount!: string;
}
```

### Quick mode example

```ts
async create(dto: CreateReturnInvoiceDto, actor: ActorContext): Promise<InvoiceEntity> {
  if (dto.mode === 'regular') {
    await this.validateRegular(dto, actor);
  }
  return this.dataSource.transaction(async manager => {
    const invoice = manager.create(InvoiceEntity, {
      organizationId: actor.organizationId,
      branchId: actor.branchId!,
      type: InvoiceType.RETURN,
      isDraft: true,
      code: `DRAFT-${randomShortUuid()}`,
      originalInvoiceId: dto.mode === 'regular' ? dto.originalInvoiceId : null,
      customerId: dto.customerId,
      sessionId: dto.sessionId,
      notes: dto.reason,
      createdBy: actor.userId,
    });
    const saved = await manager.save(invoice);
    saved.items = await Promise.all(dto.lines.map(async l => {
      const resolved = await this.catalogResolver.resolve(l, actor);
      return manager.save(manager.create(InvoiceItemEntity, {
        ...resolved,
        invoiceId: saved.id,
        direction: ItemDirection.IN,
        originalInvoiceItemId: l.originalInvoiceItemId,
      }));
    }));
    return saved;
  });
}
```

## Testing Strategy

- Mock repos for unit isolation.
- Spec `ReturnEligibilityService`: legacy invoice already partial returned, happy path, cross-org, wrong type, status ineligible.
- Spec `CreateReturnInvoiceService`: quick happy, regular happy, regular over-quota throws, missing `originalInvoiceId` in regular mode throws.
- Spec `CreateExchangeInvoiceService`: mixed lines saved with correct direction, validation chain, missing `originalInvoiceId` throws.

## Dependencies

- Phụ thuộc: [TKT-069](./TKT-069-return-entities-topics-and-enums.md) (entity + enums).
- Blocks: [TKT-073](./TKT-073-checkout-return-service-and-api.md) (CheckoutReturnService consume draft + DTO shape).
