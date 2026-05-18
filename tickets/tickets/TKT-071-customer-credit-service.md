# TKT-071 Customer credit ledger service

## Epic

[EPIC-011 POS Return & Exchange](../epics/EPIC-011-pos-return-exchange.md)

## Summary

`CustomerCreditService` quản lý lifecycle store credit:
- `issue` khi RETURN với `refundMethod=STORE_CREDIT` — phát hành credit.
- `redeem` khi khách dùng credit ở checkout sau — giảm `remainingAmount`.

Reference: [plan Step 8 - customer-credit.service](../../docs/plan-return-exchange.md#step-8--services-new).

## Deliverables

- `apps/api/src/modules/customer/services/customer-credit.service.ts` với 4 method:
  - `issue(invoice: InvoiceEntity, amount: string, manager?: EntityManager) → CustomerCreditEntity`
  - `redeem(creditId: string, amount: string, invoiceId: string, manager: EntityManager) → CustomerCreditEntity`
  - `listOpenForCustomer(customerId: string, actor: ActorContext) → CustomerCreditEntity[]`
  - `expireDue(now: Date, manager: EntityManager) → number` (scaffold method, logic batch expire defer v2)
- Generate `reference_code` qua `DocumentNumberingService`. Quyết định trong PR (open question #6 plan): dùng `DocumentType.RETURN` (prefix `RT-`) hay tạo `DocumentType.CUSTOMER_CREDIT` riêng (prefix `CR-`).
- Co-located `customer-credit.service.spec.ts`.
- Module wiring trong `customer.module.ts` (`TypeOrmModule.forFeature([CustomerCreditEntity])` + provider).

## Acceptance Criteria

- [ ] `issue` tạo row với `originalAmount = remainingAmount = amount`, `usedAmount = 0`, `status = OPEN`, `issuedAt = today`.
- [ ] `issue` reuse `manager` truyền từ outer transaction (trong `CheckoutReturnService`), không mở transaction riêng.
- [ ] `redeem` assert `remainingAmount ≥ amount`, decrement `remainingAmount`, increment `usedAmount`.
- [ ] `redeem` set `status = CONSUMED` khi `remainingAmount = 0` (partial = `OPEN`).
- [ ] Throw `BadRequestException('Credit không đủ số dư')` nếu redeem vượt remaining.
- [ ] Throw `NotFoundException` nếu `creditId` không thuộc org của actor.
- [ ] Reference code unique per org (DB constraint từ TKT-068), generate qua `DocumentNumberingService`.
- [ ] Spec: ≥ 8 case — issue happy, partial redeem, full redeem → CONSUMED, insufficient → throw, cross-org → throw, listOpen filter, double-issue cùng invoice không duplicate code.

## Definition of Done

- [ ] Unit test ≥ 8 case pass.
- [ ] Integration scenario manual: issue credit → list credit → redeem partial → list lại thấy remaining giảm.
- [ ] [docs/05-customer-management.md](../../docs/05-customer-management.md) thêm section "Store credit ledger".

## Tech Approach

### Service skeleton

```ts
@Injectable()
export class CustomerCreditService {
  constructor(
    @InjectRepository(CustomerCreditEntity) private readonly repo: Repository<CustomerCreditEntity>,
    private readonly numbering: DocumentNumberingService,
  ) {}

  async issue(invoice: InvoiceEntity, amount: string, manager?: EntityManager): Promise<CustomerCreditEntity> {
    if (!invoice.customerId) {
      throw new BadRequestException('STORE_CREDIT yêu cầu customerId');
    }
    const repo = manager ? manager.getRepository(CustomerCreditEntity) : this.repo;
    const referenceCode = await this.numbering.generate(
      DocumentType.RETURN /* TODO: confirm CUSTOMER_CREDIT separate */,
      invoice.branchId,
      { userId: invoice.createdBy, organizationId: invoice.organizationId, roles: [] } as ActorContext,
    );
    const credit = repo.create({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      customerId: invoice.customerId,
      sourceInvoiceId: invoice.id,
      referenceCode,
      originalAmount: amount,
      remainingAmount: amount,
      usedAmount: '0',
      status: CustomerCreditStatus.OPEN,
      issuedAt: new Date().toISOString().slice(0, 10),
      createdBy: invoice.createdBy,
    });
    return repo.save(credit);
  }

  async redeem(creditId: string, amount: string, invoiceId: string, manager: EntityManager): Promise<CustomerCreditEntity> {
    const repo = manager.getRepository(CustomerCreditEntity);
    const credit = await repo.findOneBy({ id: creditId });
    if (!credit) throw new NotFoundException('Credit not found');
    const remaining = new Decimal(credit.remainingAmount);
    const delta = new Decimal(amount);
    if (remaining.lt(delta)) throw new BadRequestException('Credit không đủ số dư');
    credit.remainingAmount = remaining.minus(delta).toFixed(2);
    credit.usedAmount = new Decimal(credit.usedAmount).plus(delta).toFixed(2);
    if (new Decimal(credit.remainingAmount).eq(0)) {
      credit.status = CustomerCreditStatus.CONSUMED;
    }
    return repo.save(credit);
  }
}
```

### Open questions cần resolve trong PR

1. (plan #1) GL account `customer_credit_liability` per org — cần seed sẵn? → tạo seed trong `accounting.module` nếu chưa có (depends accountant tag).
2. (plan #4) Có thêm enum value `store_credit` vào `invoice_payment_method` không? → quyết định cùng với redemption branch trong `CheckoutInvoiceService` (out of scope ticket này nhưng affect `redeem` caller).
3. (plan #6) `DocumentType.CUSTOMER_CREDIT` riêng (prefix `CR-`) vs reuse `RETURN` (prefix `RT-`). → recommend tạo riêng để khách phân biệt mã credit vs mã return.

## Testing Strategy

- Spec test isolated với mock `DocumentNumberingService`.
- Integration test trong TKT-074 (e2e flow check `customer_credits` row sau STORE_CREDIT return).

## Dependencies

- Phụ thuộc: [TKT-069](./TKT-069-return-entities-topics-and-enums.md) (entity + enum).
- Blocks: [TKT-073](./TKT-073-checkout-return-service-and-api.md) (`CheckoutReturnService` gọi `issue`).
