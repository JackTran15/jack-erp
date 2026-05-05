# TKT-027 Inventory product schema & entities

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

Tạo migration TypeORM + entity cho **products**, **product_attribute_definitions**, **product_attribute_options**, **item_attribute_values** (junction), **product_storage_locations**. **Không** đổi schema line / ledger (vẫn FK `item_id`).

## Deliverables

- 1 migration file (timestamp + `-product-catalog-schema.ts`).
- Entity classes extends `BaseEntity` pattern hiện có: `ProductEntity`, `ProductAttributeDefinitionEntity`, `ProductAttributeOptionEntity`, `ItemAttributeValueEntity`, `ProductStorageLocationEntity`.
- `items` **ALTER**: thêm `product_id` (uuid nullable, FK `products`), tuỳ chọn `variant_label` (varchar).
- Index/unique: xem **Tech Approach**.

## Acceptance Criteria

- [ ] Migration chạy thành công từ DB staging hiện tại (thêm bảng, không mất dữ liệu).
- [ ] Rollback migration hoạt động (giữ data legacy).
- [ ] Mọi FK và unique đã mô tả trong plan có trong migration.
- [ ] Entity class TypeORM mapping đúng (decorators, relation).

## Definition of Done

- [ ] PR có migration + entity files; pass CI lint + build.
- [ ] README hoặc docstring entity rõ ý nghĩa (nhất là rule unique tổ hợp option).
- [ ] Ran migration trên staging replica — snapshot DB trước khi merge vào main.

## Tech Approach

### Bảng mới

1. **`products`** (tên bảng entity `ProductEntity`)
   - Khóa: `id`, `organization_id`, `branch_id` (hoặc không gắn branch — tuỳ product là master org hay per-branch; quyết định: **org-level**, không per-branch).
   - Columns: `name`, `description`, `is_active` (boolean), `default_provider_id` (uuid nullable), `created_at`, `updated_at`, `created_by`, `updated_by`.
   - Index: `(organization_id)`, optional `(organization_id, is_active)`.

2. **`product_attribute_definitions`** (định nghĩa chiều: Size, Màu)
   - FK `product_id` → `products`.
   - Columns: `name`, `sort_order` (int default 0 để sắp xếp hiển thị).
   - Unique: `(product_id, name)`.

3. **`product_attribute_options`** (39, 40, Nâu…)
   - FK `attribute_definition_id` → `product_attribute_definitions`.
   - Columns: `value_label` (nvarchar), `sort_order` (int), `code_suffix` (varchar nullable — dùng sinh SKU nếu cần).
   - Index `(attribute_definition_id)`.

4. **`item_attribute_values`** (junction)
   - FK `item_id` → `items`, `attribute_definition_id` → `product_attribute_definitions`, `option_id` → `product_attribute_options`.
   - Unique: `(item_id, attribute_definition_id)` — mỗi item mỗi chiều chỉ một giá trị.

5. **`product_storage_locations`** (ghi nhớ 1 product / 1 vị trí / storage)
   - FK `product_id` → `products`, `storage_id` → `storages`, `location_id` → `locations`.
   - Unique: `(product_id, storage_id)`.
   - Index: `(storage_id, location_id)`.

### Sửa bảng

- **`items`**: thêm `product_id uuid nullable`, FK→`products`; thêm `variant_label varchar(255) nullable` (cột denorm tên biến thể).

### Lý do

- **Không đổi chứng từ**: giữ `stock_balances`, `stock_ledger_entries`, `purchase_order_lines`, `pos_sale_lines` vẫn FK **item_id** (cột biến thể); khi lấy tên product sẽ join từ **items→product** nếu cần.
- **nullable `product_id`**: để item legacy (hiện có) không bị FK constraint fail; migrate sau trong TKT-036.

### Rollback

- Down migration `DROP TABLE` các bảng mới; `ALTER items DROP product_id, variant_label`.

## Testing Strategy

- Unit: không cần (pure migration).
- Staging: chạy migration trên snapshot staging; kiểm tra `psql` schema + select sample.
- Rollback: chạy down migration; verify DB quay lại trạng thái cũ (item còn nguyên).

## Dependencies

- Phụ thuộc: **không** (foundation; bắt đầu từ schema hiện có EPIC-003).
- Blocks: TKT-028 (Product CRUD), TKT-029 (Attribute API), TKT-032 (Storage location rules).

