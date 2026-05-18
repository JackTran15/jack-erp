# TKT-068 Return/exchange schema migrations

## Epic

[EPIC-011 POS Return & Exchange](../epics/EPIC-011-pos-return-exchange.md)

## Summary

4 TypeORM migrations bổ sung schema cho luồng return/exchange: extend `invoices` + `invoice_items`, tạo bảng `customer_credits`, optionally thêm enum value cho `invoice_payment_method`. Mỗi migration có `up()` + `down()` đảo ngược.

Reference: [plan-return-exchange.md Step 2](../../docs/plan-return-exchange.md#step-2--schema-migrations).

## Deliverables

- `1779700000000-AddInvoiceTypeAndReturnLinks.ts`
- `1779700001000-AddInvoiceItemReturnFields.ts`
- `1779700002000-AddCustomerCreditLedger.ts`
- `1779700003000-AddStoreCreditPaymentMethod.ts` (conditional — chỉ chạy nếu user confirm open question #4)

## Acceptance Criteria

- [ ] `pnpm migration:run` trên staging snapshot có invoice cũ → `invoices.type = 'SALE'`, `invoice_items.direction = 'OUT'` cho 100% row legacy.
- [ ] `customer_credits` table tạo thành công với unique index `uq_customer_credit_ref(organization_id, reference_code)`.
- [ ] FK `invoices.original_invoice_id → invoices(id) ON DELETE RESTRICT`.
- [ ] FK `invoice_items.original_invoice_item_id → invoice_items(id) ON DELETE RESTRICT`.
- [ ] Default `returned_quantity = 0`, `refunded_amount = 0`, `net_amount = 0`.
- [ ] `pnpm migration:revert` lần lượt 4 migration → restore schema gốc sạch (column drop + table drop + enum drop).
- [ ] Enum mới (`invoice_type_enum`, `refund_method_enum`, `item_direction_enum`) tạo và rollback đúng — PostgreSQL không drop enum value đơn lẻ, down phải `DROP TYPE` toàn bộ.

## Definition of Done

- [ ] Migration test trên staging snapshot có data thực; snapshot DB trước/sau.
- [ ] Rollback test pass (`revert` rồi `run` lại cho schema identical).
- [ ] Naming: timestamp tiếp tục từ `1779600000000` (cuối Phase 1 item-management).
- [ ] Mỗi migration follow style `1778600000000-AddInvoiceCancelFields.ts`.

## Tech Approach

### 1) `1779700000000-AddInvoiceTypeAndReturnLinks.ts`

Alter `invoices`:
- `type` enum (`SALE | RETURN | EXCHANGE`) NOT NULL DEFAULT `SALE`.
- `original_invoice_id` UUID nullable, FK `invoices(id)` ON DELETE RESTRICT.
- `refund_method` enum (`CASH | STORE_CREDIT | OFFSET`) nullable.
- `refunded_amount` numeric(18,2) NOT NULL DEFAULT 0.
- `net_amount` numeric(18,2) NOT NULL DEFAULT 0.

Index:
```sql
CREATE INDEX IDX_invoices_org_original ON invoices(organization_id, original_invoice_id);
```

### 2) `1779700001000-AddInvoiceItemReturnFields.ts`

Alter `invoice_items`:
- `original_invoice_item_id` UUID nullable, FK `invoice_items(id)` ON DELETE RESTRICT.
- `returned_quantity` numeric(18,2) NOT NULL DEFAULT 0.
- `direction` enum (`OUT | IN`) NOT NULL DEFAULT `OUT`.

### 3) `1779700002000-AddCustomerCreditLedger.ts`

```sql
CREATE TABLE customer_credits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  branch_id       UUID NOT NULL,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  source_invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  reference_code  VARCHAR(50) NOT NULL,
  original_amount NUMERIC(18,2) NOT NULL,
  used_amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(18,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'OPEN',  -- OPEN | CONSUMED | EXPIRED
  issued_at       DATE NOT NULL,
  expires_at      DATE NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL,
  created_by      UUID NOT NULL
);
CREATE UNIQUE INDEX uq_customer_credit_ref
  ON customer_credits(organization_id, reference_code);
CREATE INDEX idx_customer_credit_customer_status
  ON customer_credits(customer_id, status) WHERE deleted_at IS NULL;
```

### 4) `1779700003000-AddStoreCreditPaymentMethod.ts` (conditional)

Chỉ chạy nếu user confirm open question #4 trong plan (cho phép redeem credit ở checkout sau):
```sql
ALTER TYPE invoice_payment_method_enum ADD VALUE 'store_credit';
```

**Lưu ý**: PostgreSQL không hỗ trợ `DROP VALUE` cho enum. Down: tạo enum mới không có `store_credit`, swap column type, drop enum cũ — verbose, dễ break. Tách migration riêng để skip nếu chưa cần.

## Testing Strategy

- Staging snapshot có ≥ 100 invoice mọi loại status, ≥ 500 invoice_items.
- Up: assert count, assert default values, assert FK integrity.
- Down: schema diff trước/sau == 0.
- Concurrency: 2 migration runner song song → `migrations` table lock đúng.

## Dependencies

- Phụ thuộc: [TKT-067](./TKT-067-pos-legacy-scaffolding-cleanup.md) (legacy cleanup xong, không entity/migration cũ conflict).
- Blocks: [TKT-069](./TKT-069-return-entities-topics-and-enums.md) (entity updates map schema).
