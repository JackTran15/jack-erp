# TKT-CTW-01 BE: migration + cột liên kết hóa đơn (temp_warehouse_lines + stock_transfers)

## Epic

[EPIC-25062026 Checkout ↔ Kho tạm](../epics/EPIC-25062026-checkout-temp-warehouse-fulfillment.md)

## Summary

Thêm liên kết có cấu trúc giữa dòng kho tạm / phiếu chuyển kho và hóa đơn POS, để (1) consumer fulfill gắn `invoiceId` khi tiêu thụ dòng, (2) phiếu CK tham chiếu được hóa đơn, (3) report kho tạm điền được `saleQty`/`invoice`. Mở rộng 2 bảng sẵn có; **không** tạo bảng mới.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-AddInvoiceLinkToTempWarehouseAndTransfer.ts` (new) — hand-written:
  - `ALTER TABLE temp_warehouse_lines ADD COLUMN invoice_id uuid NULL`, `ADD COLUMN invoice_number varchar(50) NULL`.
  - `ALTER TABLE stock_transfers ADD COLUMN invoice_id uuid NULL`, `ADD COLUMN invoice_number varchar(50) NULL`.
  - Index `IDX_temp_warehouse_lines_invoice` on `(invoice_id)` (partial `WHERE invoice_id IS NOT NULL`) cho report/lookup.
  - `down()` drop index + cột.
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse-line.entity.ts` — thêm `@Column({ type: 'uuid', nullable: true }) invoiceId` + `@Column({ type: 'varchar', length: 50, nullable: true }) invoiceNumber`.
- `apps/api/src/modules/inventory/transfer/stock-transfer.entity.ts` — thêm `invoiceId` + `invoiceNumber` (cùng kiểu, nullable).

## Acceptance Criteria

- [ ] Migration chạy `up` trên DB có dữ liệu cũ → các dòng/phiếu hiện hữu có `invoice_id = NULL`, `invoice_number = NULL` (không vỡ dữ liệu).
- [ ] `down` revert sạch (drop index + 4 cột).
- [ ] Entity khai báo khớp cột; `synchronize` vẫn false; `pnpm migration:run` rồi `pnpm migration:show` xác nhận đã apply.
- [ ] Không cột nào ngoài migration; không sửa cột inherited (theo lưu ý TypeORM 0.3.28).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint pass.
- [ ] Migration hand-written (không dùng `migration:generate` drift).
- [ ] No Vietnamese trong source backend (migration name/comment English).

## Tech Approach

```ts
export class AddInvoiceLinkToTempWarehouseAndTransfer1719... implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "temp_warehouse_lines"
      ADD COLUMN "invoice_id" uuid NULL,
      ADD COLUMN "invoice_number" varchar(50) NULL`);
    await q.query(`ALTER TABLE "stock_transfers"
      ADD COLUMN "invoice_id" uuid NULL,
      ADD COLUMN "invoice_number" varchar(50) NULL`);
    await q.query(`CREATE INDEX "IDX_temp_warehouse_lines_invoice"
      ON "temp_warehouse_lines" ("invoice_id") WHERE "invoice_id" IS NOT NULL`);
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_temp_warehouse_lines_invoice"`);
    await q.query(`ALTER TABLE "stock_transfers" DROP COLUMN "invoice_number", DROP COLUMN "invoice_id"`);
    await q.query(`ALTER TABLE "temp_warehouse_lines" DROP COLUMN "invoice_number", DROP COLUMN "invoice_id"`);
  }
}
```

## Testing Strategy

- Chạy `pnpm migration:run` trên DB dev + `migration:revert` để xác nhận up/down. Entity load không lỗi (app boot).

## Dependencies

- Depends on: —
- Blocks: TKT-CTW-02, TKT-CTW-04, TKT-CTW-05, TKT-CTW-08.
