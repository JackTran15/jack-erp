# TKT-045 Promotion module — entities & migration

## Epic

[EPIC-007 POS Invoice, Customer Loyalty & Promotions](../epics/EPIC-007-pos-invoice-customer-promotions.md)

## Summary

Tạo module `modules/promotion/` với 3 entities: `DiscountCodeEntity`, `VoucherEntity`, `PromotionEntity`. Migration và CRUD API quản lý các loại ưu đãi. **Chưa** bao gồm logic áp dụng vào hóa đơn (TKT-046).

## Deliverables

- 1 migration file: `1778400000000-AddPromotionEntities.ts`
- `DiscountCodeEntity` (`modules/promotion/discount-code.entity.ts`)
- `VoucherEntity` (`modules/promotion/voucher.entity.ts`)
- `PromotionEntity` (`modules/promotion/promotion.entity.ts`)
- `PromotionModule` (`modules/promotion/promotion.module.ts`)
- CRUD services + controllers cho cả 3 entity
- Zod schemas validate JSONB fields của `PromotionEntity`
- Enum: `DiscountType` (`percentage | fixed_amount`), `PromotionType` (`order_discount | gift_product | buy_x_get_y | product_discount`)

## Implementation Status

⚠️ **MOSTLY COMPLETED** — 2026-05-07

Files delivered:
- `apps/api/src/database/migrations/1778400000000-AddPromotionEntities.ts` — 3 enums + 4 tables
- `apps/api/src/modules/promotion/discount-code.entity.ts`
- `apps/api/src/modules/promotion/voucher.entity.ts`
- `apps/api/src/modules/promotion/promotion.entity.ts`
- `apps/api/src/modules/promotion/invoice-promotion.entity.ts`
- `apps/api/src/modules/promotion/discount-code.service.ts`
- `apps/api/src/modules/promotion/voucher.service.ts`
- `apps/api/src/modules/promotion/promotion.service.ts`
- `apps/api/src/modules/promotion/promotion.controller.ts`
- `apps/api/src/modules/promotion/promotion.module.ts`
- `apps/api/src/modules/promotion/discount-code.service.spec.ts` — 14 tests
- `apps/api/src/modules/promotion/voucher.service.spec.ts` — 14 tests

**Chưa implement:**
- Zod schema validation cho `conditions` / `benefits` JSONB (validate ở application layer, nhưng chưa dùng Zod)

## Acceptance Criteria

- [x] CRUD `GET/POST/PATCH/DELETE /discount-codes` hoạt động; `code` unique per org.
- [x] CRUD `GET/POST/PATCH/DELETE /vouchers` hoạt động; `code` unique per org.
- [x] CRUD `GET/POST/PATCH/DELETE /promotions` (`/programs` trong controller) hoạt động.
- [ ] Validate `conditions` và `benefits` JSONB qua Zod. *(chưa implement Zod schema)*
- [x] `POST /vouchers/:code/validate` kiểm tra voucher: còn hiệu lực, chưa dùng, `customer_id` khớp.
- [x] `POST /discount-codes/:code/validate` kiểm tra mã: còn hiệu lực, chưa hết lượt dùng.
- [x] Soft delete (`is_active=false`) — không hard delete.

## Definition of Done

- [x] PR có migration + 3 entities + module + services + controllers; pass CI lint + build.
- [x] Unit test: validate voucher đã dùng → 400, validate code hết lượt → 400.
- [ ] Zod schema reject khi `conditions` hoặc `benefits` sai shape. *(chưa implement)*

## Tech Approach

### `discount_codes`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | |
| `code` | varchar | UNIQUE per org |
| `discount_type` | enum | `percentage \| fixed_amount` |
| `discount_value` | decimal(18,2) | |
| `min_order_value` | decimal(18,2) | |
| `max_uses` | int | nullable = unlimited |
| `used_count` | int | default 0 |
| `valid_from` | timestamptz | |
| `valid_to` | timestamptz | |
| `is_active` | boolean | |

### `vouchers`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | |
| `code` | varchar | UNIQUE per org |
| `face_value` | decimal(18,2) | |
| `customer_id` | uuid FK | → customers — nullable |
| `valid_from` | timestamptz | |
| `valid_to` | timestamptz | |
| `is_used` | boolean | single-use flag |
| `redeemed_invoice_id` | uuid FK | → invoices — nullable |
| `is_active` | boolean | |

### `promotions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | |
| `name` | varchar | |
| `type` | enum | `order_discount \| gift_product \| buy_x_get_y \| product_discount` |
| `conditions` | jsonb | validate bằng Zod |
| `benefits` | jsonb | validate bằng Zod |
| `valid_from` | timestamptz | |
| `valid_to` | timestamptz | |
| `applicable_branch_ids` | uuid[] | empty = all branches |
| `is_active` | boolean | |

### Zod schemas

```typescript
const ConditionsSchema = z.object({
  min_order_value: z.number().optional(),
  required_item_ids: z.array(z.string().uuid()).optional(),
  required_customer_tier: z.enum(['none','silver','gold','diamond']).optional(),
  can_stack: z.boolean().default(false),
});

const BenefitsSchema = z.object({
  discount_type: z.enum(['percentage','fixed_amount']),
  discount_value: z.number(),
  free_item_id: z.string().uuid().nullable().optional(),
  free_quantity: z.number().int().default(0),
});
```

## Testing Strategy

- Unit: Zod validation (valid/invalid shapes), validate voucher đã dùng, code hết lượt.
- Migration: staging snapshot.

## Dependencies

- Requires: TKT-038 (InvoiceEntity — FK vouchers.redeemed_invoice_id), TKT-041 (CustomerEntity — FK vouchers.customer_id).
- Blocks: TKT-046 (apply service cần 3 entities này).
