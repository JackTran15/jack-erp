# TKT-LDB-01 BE: Migration + entity columns (line discount breakdown)

## Epic

[EPIC-03062026 POS per-line discount breakdown + line note in read APIs](../epics/EPIC-03062026-pos-line-discount-breakdown.md)

## Summary

Mở rộng bảng `invoice_items` để lưu **đầy đủ breakdown** của khuyến mãi/chiết khấu thủ công theo dòng: loại giảm, giá trị gốc, lý do/nhãn. Giữ nguyên `line_discount` (số tiền đã tính) và `note`. Hand-written migration + thêm cột vào `InvoiceItemEntity`; không tạo bảng mới, không đổi scope.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-AddInvoiceItemLineDiscountBreakdown.ts` (new) — hand-written `ALTER TABLE "invoice_items"` thêm 3 cột nullable + `down()` drop chúng.
- `apps/api/src/modules/pos/entities/invoice-item.entity.ts` — thêm enum `LineDiscountType` và 3 `@Column` mới; chèn ngay sau cột `line_discount`/`line_total` (dòng 45–49 hiện tại), không đụng `note`/`sortOrder`.

## Acceptance Criteria

- [ ] 3 cột mới trên `invoice_items`, tất cả **nullable** (an toàn cho dòng cũ):
  - `line_discount_type` — `enum('percent','amount')`, nullable.
  - `line_discount_value` — `numeric(18,2)`, nullable (giá trị gốc người dùng nhập: `10` = 10 %, hoặc số tiền).
  - `line_discount_reason` — `varchar(255)`, nullable (nhãn tự do, vd `cc`).
- [ ] Cột `line_discount` (số tiền đã tính) và `line_total` **giữ nguyên** type/default.
- [ ] Enum DB type đặt tên rõ ràng (vd `invoice_items_line_discount_type_enum`) để `down()` drop sạch (cả type lẫn cột).
- [ ] Dòng `invoice_items` đã tồn tại trước migration: 3 cột mới = `NULL`, không backfill, không vỡ ràng buộc.
- [ ] `synchronize` vẫn `false`; chạy `pnpm migration:run` rồi `migration:revert` round-trip sạch.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass (entity compile).
- [ ] `migration:run` + `migration:revert` chạy được hai chiều trên DB sạch.
- [ ] Không đổi schema ngoài migration này; không Vietnamese trong source backend.

## Tech Approach

Enum + cột (chèn sau `lineTotal`, dùng tên snake_case như các cột khác trong file):

```ts
// invoice-item.entity.ts — cạnh enum ItemDirection có sẵn
export enum LineDiscountType {
  PERCENT = 'percent',
  AMOUNT = 'amount',
}

@Column({
  name: 'line_discount_type',
  type: 'enum',
  enum: LineDiscountType,
  nullable: true,
  comment: 'Type of manual per-line discount; null = legacy raw lineDiscount only',
})
lineDiscountType?: LineDiscountType;

@Column({
  name: 'line_discount_value',
  type: 'numeric',
  precision: 18,
  scale: 2,
  nullable: true,
  comment: 'Raw user-entered discount value (e.g. 10 for 10%, or a currency amount)',
})
lineDiscountValue?: number;

@Column({
  name: 'line_discount_reason',
  type: 'varchar',
  length: 255,
  nullable: true,
  comment: 'Free-text label/reason for the per-line discount (e.g. "cc")',
})
lineDiscountReason?: string;
```

Migration (hand-written, raw SQL `up`/`down`):

```ts
export class AddInvoiceItemLineDiscountBreakdown<timestamp>
  implements MigrationInterface
{
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "invoice_items_line_discount_type_enum" AS ENUM ('percent','amount')`);
    await q.query(`ALTER TABLE "invoice_items" ADD "line_discount_type" "invoice_items_line_discount_type_enum"`);
    await q.query(`ALTER TABLE "invoice_items" ADD "line_discount_value" numeric(18,2)`);
    await q.query(`ALTER TABLE "invoice_items" ADD "line_discount_reason" character varying(255)`);
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "invoice_items" DROP COLUMN "line_discount_reason"`);
    await q.query(`ALTER TABLE "invoice_items" DROP COLUMN "line_discount_value"`);
    await q.query(`ALTER TABLE "invoice_items" DROP COLUMN "line_discount_type"`);
    await q.query(`DROP TYPE "invoice_items_line_discount_type_enum"`);
  }
}
```

> `migration:generate` sinh drift lớn ở repo này — viết tay theo CREATE/ALTER trên (xem `feedback_handwrite_migrations`). Lấy `<timestamp>` lớn hơn migration mới nhất trong `apps/api/src/database/migrations/`.

## Testing Strategy

- Không unit riêng; bao phủ qua `migration:run`/`revert` round-trip và compile entity. Hành vi ghi/đọc test ở TKT-LDB-02 / TKT-LDB-04.

## Dependencies

- Depends on: none (BE root của epic).
- Blocks: TKT-LDB-02 (DTO + service compute), TKT-LDB-03 (read APIs).
