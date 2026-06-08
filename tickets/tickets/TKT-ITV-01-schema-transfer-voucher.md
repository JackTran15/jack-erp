# TKT-ITV-01 Schema: extend transfer_orders + lines + enum rebuild + data migration

## Epic

[EPIC-07062026 Phiếu Điều Chuyển Kho](../epics/EPIC-07062026-inventory-transfer-voucher.md)

## Layer

🟦 Backend only (DB schema, extend-in-place).

## Summary

Nền móng. **Mở rộng tại chỗ** `transfer_orders` + `transfer_order_lines` (KHÔNG tạo bảng mới) để hỗ trợ phiếu điều chuyển 2 pha: rebuild enum trạng thái sang `DRAFT|IN_PROGRESS|COMPLETED|CANCELLED` (migrate `EXECUTED→COMPLETED`, `APPROVED→DRAFT`), thêm cột liên kết 2 chân xuất/nhập + đính kèm, và thêm **kho nguồn/đích theo từng dòng**. Viết tay **một** migration. Giữ `LDC`/`DocumentType.TRANSFER_ORDER` (không thêm doc type mới).

## Deliverables

- `apps/api/src/modules/inventory/transfer-order/transfer-order.entity.ts` — sửa enum + thêm cột:
  - `enum TransferOrderStatus { DRAFT, IN_PROGRESS, COMPLETED, CANCELLED }` (bỏ `APPROVED`/`EXECUTED`).
  - Thêm: `exportGoodsIssueId` (`export_goods_issue_id` uuid nullable), `importGoodsReceiptId` (`import_goods_receipt_id` uuid nullable — **import_reference**), `exportedAt`/`exportedBy`, `completedAt`/`completedBy`, `cancelledAt`/`cancelledBy` (timestamptz/uuid nullable), `attachmentIds` (`attachment_ids` jsonb default `'[]'::jsonb`, mirror `GoodsReceiptEntity`).
  - Giữ nguyên cột legacy `approvedAt/By`, `executedAt/By`, `executedTransferId`, `notes`, `requestedDate` (không ghi nữa nhưng không drop để an toàn dữ liệu cũ).
- `apps/api/src/modules/inventory/transfer-order/transfer-order-line.entity.ts` — thêm `sourceStorageId` (`source_storage_id` uuid nullable) + `destinationStorageId` (`destination_storage_id` uuid nullable). Giữ `requestedQty` (numeric 18,3) làm số lượng điều chuyển.
- `apps/api/src/database/migrations/1782900000000-TransferOrderTwoPhase.ts` (new, timestamp > `1782800000000`) — hand-written; xem note enum bên dưới.

### Migration `up()`

1. **Rebuild enum (transaction-safe)** — KHÔNG dùng `ALTER TYPE ... ADD VALUE` (lỗi trong transaction):
   ```sql
   CREATE TYPE "transfer_orders_status_enum_new" AS ENUM ('DRAFT','IN_PROGRESS','COMPLETED','CANCELLED');
   ALTER TABLE "transfer_orders" ALTER COLUMN "status" DROP DEFAULT;
   ALTER TABLE "transfer_orders" ALTER COLUMN "status" TYPE "transfer_orders_status_enum_new"
     USING (CASE
       WHEN "status"::text = 'EXECUTED' THEN 'COMPLETED'
       WHEN "status"::text = 'APPROVED' THEN 'DRAFT'
       ELSE "status"::text
     END::"transfer_orders_status_enum_new");
   ALTER TABLE "transfer_orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
   DROP TYPE "transfer_orders_status_enum";
   ALTER TYPE "transfer_orders_status_enum_new" RENAME TO "transfer_orders_status_enum";
   ```
2. `ALTER TABLE "transfer_orders" ADD COLUMN IF NOT EXISTS` cho: `export_goods_issue_id uuid`, `import_goods_receipt_id uuid`, `exported_at timestamptz`, `exported_by uuid`, `completed_at timestamptz`, `completed_by uuid`, `cancelled_at timestamptz`, `cancelled_by uuid`, `attachment_ids jsonb NOT NULL DEFAULT '[]'::jsonb`.
3. `ALTER TABLE "transfer_order_lines" ADD COLUMN IF NOT EXISTS` cho: `source_storage_id uuid`, `destination_storage_id uuid`.

### Migration `down()`

- Drop các cột vừa thêm; rebuild enum ngược lại về `('DRAFT','APPROVED','EXECUTED','CANCELLED')` với `USING` map `IN_PROGRESS→APPROVED`, `COMPLETED→EXECUTED`.

## Acceptance Criteria

- [ ] `pnpm migration:run`: enum `transfer_orders_status_enum` chỉ còn `DRAFT/IN_PROGRESS/COMPLETED/CANCELLED`; hàng cũ `EXECUTED`→`COMPLETED`, `APPROVED`→`DRAFT`; cột mới tồn tại; `transfer_order_lines` có 2 cột storage.
- [ ] `pnpm migration:revert` đảo sạch (enum về 4 giá trị cũ, drop cột mới).
- [ ] Enum DB type name vẫn là `transfer_orders_status_enum` (khớp default TypeORM `<table>_status_enum`) ⇒ `migration:generate` không sinh drift.
- [ ] `synchronize:false`; hàng `transfer_orders`/`transfer_order_lines` cũ còn nguyên (chỉ đổi status + thêm cột nullable).
- [ ] Không thêm `DocumentType` mới; phiếu vẫn dùng `LDC` (TRANSFER_ORDER).

## Definition of Done

- [ ] PR gồm 2 entity sửa + 1 migration; `pnpm --filter @erp/api build` pass.
- [ ] Migration up/down round-trip sạch trên DB có sẵn vài hàng transfer_orders (test cả nhánh remap status) — kiểm qua Adminer :18088.
- [ ] Source tiếng Anh (comment/column comment/log).
- [ ] Grep & note (không sửa ở ticket này) mọi nơi còn tham chiếu `TransferOrderStatus.APPROVED`/`.EXECUTED` để TKT-ITV-02/03/08 dọn.

## Tech Approach

`ALTER TYPE ... ADD VALUE` không chạy trong transaction (TypeORM bọc migration trong tx) ⇒ dùng kỹ thuật **recreate enum + cast column với USING** ở trên (vừa thêm giá trị mới vừa remap dữ liệu trong 1 bước, transaction-safe). Xem `feedback_handwrite_migrations` — viết tay, lấy `<timestamp>` > `1782800000000`. `attachment_ids` mirror `GoodsReceiptEntity.attachmentIds`. Cột storage để line override; nếu null → fallback header `source_storage_id`/`destination_storage_id` (resolve ở service TKT-ITV-03).

## Dependencies

- Requires: bảng `transfer_orders`/`transfer_order_lines` (đã có).
- Blocks: TKT-ITV-02, TKT-ITV-03.
