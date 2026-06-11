# TKT-IWT-01 Schema: per-line storage + valuation + transporter + attachments + transferred_at

## Epic

[EPIC-09062026 Chuyển kho giữa các kho trong cùng chi nhánh](../epics/EPIC-09062026-inter-warehouse-transfer.md)

## Layer

🟦 Backend only (DB schema + entity).

## Summary

Foundation của epic. **Mở rộng** 2 entity sẵn có (`StockTransferEntity` = `stock_transfers`, `StockTransferLineEntity` = `stock_transfer_lines`) để chứa Kho xuất/Kho nhập theo dòng, đơn giá/thành tiền, người vận chuyển, tài liệu đính kèm, và mốc thời gian chuyển. Viết tay **một** migration, ADD column + backfill, KHÔNG tạo bảng/module mới.

## Deliverables

- `apps/api/src/modules/inventory/transfer/stock-transfer-line.entity.ts` — thêm:
  - `source_storage_id` (`sourceStorageId`, uuid, **nullable** ở DB để backfill an toàn) + `@ManyToOne(() => StorageEntity, { eager: true })` `@JoinColumn({ name: 'source_storage_id' })`.
  - `destination_storage_id` (`destinationStorageId`, uuid, nullable) + `@ManyToOne(() => StorageEntity, { eager: true })`.
  - `unit_price` (`unitPrice`, `numeric(18,2)` nullable, TS type `string | null` — pg trả string; Đơn giá xuất).
  - `line_value` (`lineValue`, `numeric(18,2)` nullable, TS type `string | null` — Thành tiền = unit_price × quantity).
  - Giữ `source_location_id` / `destination_location_id` (đã nullable) — vị trí cụ thể; bỏ trống → resolve runtime.
- `apps/api/src/modules/inventory/transfer/stock-transfer.entity.ts` — thêm:
  - `transporter_user_id` (`transporterUserId`, uuid, nullable) — Người vận chuyển (không đặt hard FK cross-module; validate ở service).
  - `attachment_ids` (`attachmentIds`, `jsonb` default `'[]'::jsonb`) — copy y hệt convention `goods-receipt.entity.ts:72`.
  - `transferred_at` (`transferredAt`, `timestamptz` nullable) — Ngày + Giờ chuyển.
  - Đổi `source_location_id` / `destination_location_id` (header) sang **nullable** (mô hình mới đẩy nguồn/đích xuống từng dòng; header chỉ giữ cho back-compat).
- `apps/api/src/database/migrations/1783300000000-StockTransferInterWarehouse.ts` (timestamp > `1783200000000`), viết tay theo style `1783000000000-AddTransferOrderLineSourceLocation.ts`:
  1. `ALTER TABLE "stock_transfer_lines" ADD COLUMN IF NOT EXISTS "source_storage_id" uuid`, `"destination_storage_id" uuid`, `"unit_price" numeric(18,2)`, `"line_value" numeric(18,2)`.
  2. `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "transporter_user_id" uuid`, `"attachment_ids" jsonb NOT NULL DEFAULT '[]'::jsonb`, `"transferred_at" timestamptz`.
  3. `ALTER TABLE "stock_transfers" ALTER COLUMN "source_location_id" DROP NOT NULL`, tương tự `destination_location_id`.
  4. **Backfill** `stock_transfer_lines`: set `source_storage_id`/`destination_storage_id` = `storage_id` của location tương ứng —
     `UPDATE stock_transfer_lines l SET source_storage_id = loc.storage_id FROM locations loc WHERE loc.id = COALESCE(l.source_location_id, (SELECT t.source_location_id FROM stock_transfers t WHERE t.id = l.transfer_id)) AND l.source_storage_id IS NULL;` (và bản destination tương ứng).
  5. Backfill `transferred_at = posted_at` (fallback `created_at`) cho phiếu cũ.
  6. FK (guarded `DO $$ … duplicate_object`): `FK_stock_transfer_lines_source_storage` (`source_storage_id → storages(id) ON DELETE RESTRICT`), `FK_stock_transfer_lines_dest_storage` tương tự. Index `idx_stock_transfer_lines_source_storage`, `idx_stock_transfer_lines_dest_storage`.
  7. `down()` đảo thứ tự: drop index/FK, `DROP COLUMN IF EXISTS` các cột mới, `ALTER COLUMN … SET NOT NULL` lại header location (chỉ khi data cho phép — guard).

## Acceptance Criteria

- [ ] `pnpm migration:run` thêm đủ cột mới; `pnpm migration:revert` drop sạch (down chạy không lỗi).
- [ ] Sau migration, mọi dòng phiếu cũ có `source_storage_id`/`destination_storage_id` = storage của location cũ (cùng 1 storage vì phiếu cũ là chuyển nội kho); không dòng nào còn NULL.
- [ ] `attachment_ids` mặc định `[]`; `transferred_at` cũ = `posted_at`/`created_at`.
- [ ] `synchronize:false` — sau `migration:run`, `migration:generate` KHÔNG sinh drift cho 2 entity.

## Definition of Done

- [ ] PR gồm 2 entity + 1 migration; `pnpm --filter @erp/api build` pass.
- [ ] Migration up/down chạy local sạch (kiểm tra qua Adminer :18088).
- [ ] Source tiếng Anh (comment/log/column comment).

## Tech Approach

- `numeric(18,2)` → khai báo TS `string | null` (giống các cột tiền khác trong repo).
- `attachment_ids` copy đúng dòng `@Column({ name: 'attachment_ids', type: 'jsonb', default: () => "'[]'::jsonb" })` từ `goods-receipt.entity.ts`.
- Cột `*_storage_id` để nullable ở DB nhưng service (TKT-IWT-02) bắt buộc có giá trị khi tạo mới → tránh phải backfill phức tạp mà vẫn an toàn.

## Dependencies

- Requires: bảng `stock_transfers`, `stock_transfer_lines`, `storages`, `locations` (đã có).
- Blocks: TKT-IWT-02.
