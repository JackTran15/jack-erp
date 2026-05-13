# TKT-069 Return entities, Kafka topics & shared enums

## Epic

[EPIC-011 POS Return & Exchange](../epics/EPIC-011-pos-return-exchange.md)

## Summary

Map schema TKT-068 vào TypeORM entity, export enums qua `@erp/shared-interfaces`, đăng ký 5 Kafka topic constants + `DomainEventType` cho fan-out events.

Refs: [plan Step 3](../../docs/plan-return-exchange.md#step-3--entity-updates), [Step 4](../../docs/plan-return-exchange.md#step-4--topics--shared-enums).

## Deliverables

### Entities (apps/api)

- Sửa `apps/api/src/modules/pos/entities/invoice.entity.ts`:
  - Enum `InvoiceType { SALE, RETURN, EXCHANGE }`, `RefundMethod { CASH, STORE_CREDIT, OFFSET }`.
  - 5 column mới: `type`, `originalInvoiceId`, `refundMethod`, `refundedAmount`, `netAmount`.
  - Self-ref relation `originalInvoice`.
- Sửa `apps/api/src/modules/pos/entities/invoice-item.entity.ts`:
  - Enum `ItemDirection { OUT, IN }`.
  - 3 column mới: `originalInvoiceItemId`, `returnedQuantity`, `direction`.
  - Self-ref relation `originalInvoiceItem`.
- Mới `apps/api/src/modules/customer/entities/customer-credit.entity.ts`.

### Shared interfaces (packages)

- Export `InvoiceType`, `RefundMethod`, `ItemDirection`, `CustomerCreditStatus` từ `packages/shared-interfaces/src/pos/index.ts`.
- Thêm 5 `DomainEventType` values vào `packages/shared-interfaces/src/events/index.ts`:
  - `STOCK_RETURN_IN`, `LOYALTY_POINTS_REVERSE`, `CASH_REFUND`, `JOURNAL_POST_RETURN`, `RETURN_POSTED`.

### Kafka topics

- `packages/shared-kafka-client/src/topics.ts` — 5 constants:
  - `RETURN_POSTED = 'erp.return.posted'`
  - `STOCK_RETURN_IN = 'erp.stock.return.in'`
  - `LOYALTY_POINTS_REVERSE = 'erp.loyalty.points.reverse'`
  - `CASH_REFUND = 'erp.cash.refund'`
  - `JOURNAL_POST_RETURN = 'erp.journal.post.return'`
- `apps/api/src/modules/events/topics.init.ts` — đăng ký 5 TopicSpec:
  - `STOCK_RETURN_IN`: 6 partitions (match `STOCK_DEDUCTION`).
  - 4 còn lại: 3 partitions, replication = default.

### Build

- `pnpm build:shared` pass, `pnpm --filter @erp/api build` pass.

## Acceptance Criteria

- [ ] Entity reflect schema TKT-068 100% (column types, nullability, FK).
- [ ] Enum `InvoiceType` default getter cho legacy data = `SALE`.
- [ ] Self-ref relation `@ManyToOne(() => InvoiceEntity)` không gây circular import lúc build.
- [ ] `pnpm build:shared` regenerate `dist/` chứa 4 enum mới và 5 DomainEventType.
- [ ] `TopicInitializer.run()` trên startup tạo 5 topic nếu chưa có, idempotent khi restart (`kafka-topics --list` xác nhận).
- [ ] OpenAPI snapshot cập nhật: schema `Invoice` có `type/refundMethod/refundedAmount/netAmount/originalInvoiceId`, schema `InvoiceItem` có `direction/returnedQuantity/originalInvoiceItemId`.

## Definition of Done

- [ ] PR pass lint + build CI.
- [ ] Local: `make dev-api` lên không lỗi, `/docs` show schema mới.
- [ ] `pnpm openapi:generate` regenerate `packages/api-client/src/generated/schema.ts` + `openapi.snapshot.json` committed.

## Tech Approach

### `InvoiceEntity` additions

```ts
export enum InvoiceType { SALE = 'SALE', RETURN = 'RETURN', EXCHANGE = 'EXCHANGE' }
export enum RefundMethod { CASH = 'CASH', STORE_CREDIT = 'STORE_CREDIT', OFFSET = 'OFFSET' }

@Column({ type: 'enum', enum: InvoiceType, default: InvoiceType.SALE })
type!: InvoiceType;

@Column({ name: 'original_invoice_id', type: 'uuid', nullable: true })
originalInvoiceId?: string;

@ManyToOne(() => InvoiceEntity, { nullable: true })
@JoinColumn({ name: 'original_invoice_id' })
originalInvoice?: InvoiceEntity;

@Column({ name: 'refund_method', type: 'enum', enum: RefundMethod, nullable: true })
refundMethod?: RefundMethod;

@Column({ name: 'refunded_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
refundedAmount!: string;

@Column({ name: 'net_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
netAmount!: string;
```

### `InvoiceItemEntity` additions

```ts
export enum ItemDirection { OUT = 'OUT', IN = 'IN' }

@Column({ type: 'enum', enum: ItemDirection, default: ItemDirection.OUT })
direction!: ItemDirection;

@Column({ name: 'returned_quantity', type: 'numeric', precision: 18, scale: 2, default: 0 })
returnedQuantity!: string;

@Column({ name: 'original_invoice_item_id', type: 'uuid', nullable: true })
originalInvoiceItemId?: string;

@ManyToOne(() => InvoiceItemEntity, { nullable: true })
@JoinColumn({ name: 'original_invoice_item_id' })
originalInvoiceItem?: InvoiceItemEntity;
```

### `CustomerCreditEntity` skeleton

```ts
export enum CustomerCreditStatus { OPEN = 'OPEN', CONSUMED = 'CONSUMED', EXPIRED = 'EXPIRED' }

@Entity('customer_credits')
export class CustomerCreditEntity extends BaseEntity {
  @Column({ name: 'customer_id', type: 'uuid' }) customerId!: string;
  @Column({ name: 'source_invoice_id', type: 'uuid' }) sourceInvoiceId!: string;
  @Column({ name: 'reference_code', type: 'varchar', length: 50 }) referenceCode!: string;
  @Column({ name: 'original_amount', type: 'numeric', precision: 18, scale: 2 }) originalAmount!: string;
  @Column({ name: 'used_amount', type: 'numeric', precision: 18, scale: 2, default: 0 }) usedAmount!: string;
  @Column({ name: 'remaining_amount', type: 'numeric', precision: 18, scale: 2 }) remainingAmount!: string;
  @Column({ type: 'enum', enum: CustomerCreditStatus, default: CustomerCreditStatus.OPEN }) status!: CustomerCreditStatus;
  @Column({ name: 'issued_at', type: 'date' }) issuedAt!: string;
  @Column({ name: 'expires_at', type: 'date', nullable: true }) expiresAt?: string;
}
```

### Topic registration

`apps/api/src/modules/events/topics.init.ts`:
```ts
const RETURN_TOPICS: TopicSpec[] = [
  { name: KafkaTopics.STOCK_RETURN_IN, partitions: 6, replicationFactor: defaultReplication },
  { name: KafkaTopics.LOYALTY_POINTS_REVERSE, partitions: 3, replicationFactor: defaultReplication },
  { name: KafkaTopics.CASH_REFUND, partitions: 3, replicationFactor: defaultReplication },
  { name: KafkaTopics.JOURNAL_POST_RETURN, partitions: 3, replicationFactor: defaultReplication },
  { name: KafkaTopics.RETURN_POSTED, partitions: 3, replicationFactor: defaultReplication },
];
```

## Testing Strategy

- Unit: instantiate entity với data mock, assert default values.
- Integration: bring up `make dev-api` + Redpanda → `kafka-topics --list` show 5 topic mới sau startup.
- Build CI: shared-interfaces dist + api-client gen verify enum hiện diện.

## Dependencies

- Phụ thuộc: [TKT-068](./TKT-068-return-exchange-schema-migrations.md) (DB schema).
- Blocks: [TKT-070](./TKT-070-return-publishers-and-consumers.md), [TKT-071](./TKT-071-customer-credit-service.md), [TKT-072](./TKT-072-return-eligibility-and-draft-services.md).
