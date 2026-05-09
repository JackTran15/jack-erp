# TKT-030 Variant generation service

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

Service sinh **Item** (biến thể) + **ItemAttributeValueEntity** từ product × option: chọn **full Cartesian** hoặc **lazy on-demand**. Tạo `code` (SKU), `name` hiển thị, junction rows; validate unique tổ hợp option.

## Deliverables

- `VariantGenerationService` (class + method `generateVariants(productId, strategyOptions?)` hoặc `resolveOrCreateVariant(productId, {size,color,...})`).
- Rule sinh `code`: prefix product + mã ngắn option hoặc auto-increment (quyết định v1: **prefix + option codes** nếu `codeSuffix` có; fallback UUID short).
- `name` / `variant_label`: ghép `Product.name` + chuỗi thuộc tính (39 · Nâu · Bóng).
- Junction row: `item_attribute_values` (itemId, defId, optionId).

## Acceptance Criteria

- [ ] POST `/api/v1/products/:id/generate-variants` (hoặc endpoint riêng) → trả `createdCount` + danh sách item IDs.
- [ ] **Chiến lược full Cartesian**: tính N×M×K → cảnh báo nếu > threshold (ví dụ 500 biến thể) → sinh hết + junction.
- [ ] **Chiến lược lazy**: endpoint riêng hoặc logic trong service: khi nhập kho / POS chọn tổ hợp → kiểm tra item chưa tồn → tạo mới + junction.
- [ ] Unique: không tạo trùng **tổ hợp option** trên cùng product — check trước khi insert.
- [ ] `Item.code` sinh ra **unique** (constraint unique `(organizationId, code)` ở entity).
- [ ] `variant_label` ghép đúng (có thể dùng sortOrder để sắp xếp thuộc tính).

## Definition of Done

- [ ] PR: service + controller endpoint; tests pass.
- [ ] E2E: product có 2 chiều (3×2 options) → generate → kiểm tra 6 item tạo ra, junction đúng 6×2 dòng.
- [ ] Edge case: gọi generate 2 lần → không trùng / không lỗi (idempotent hoặc báo lỗi đã tồn tại).
- [ ] DoD: README service mô tả chiến lược (full vs lazy); commit message rõ lựa chọn v1.

## Tech Approach

### Quyết định chính (cần chốt trong ticket hoặc theo plan)

- **Full Cartesian v1**: khi product hoàn tất cấu hình → gọi endpoint sinh hết biến thể.
- **Lazy on-demand**: endpoint khác — khi nhập/bán tổ hợp (size, color) → service check exist → create if missing.

Ticket này **triển khai cả hai** (flag trong DTO `strategy: 'full' | 'lazy'`) hoặc **chỉ một** nếu quyết định cứng. Ưu tiên: **full Cartesian** v1 đơn giản hơn.

### Logic sinh biến thể (full)

1. Query `ProductAttributeDefinition` + options cho `productId`.
2. Tính tích Descartes: duyệt đệ quy hoặc nested loop → mảng tổ hợp `[{defId:X, optionId:Y}]`.
3. Foreach tổ hợp:
   - Check exists: query `item_attribute_values` (itemId có junction đúng tổ hợp?) → nếu có skip.
   - Generate `code`: `product.code_prefix` + `-` + join `option.codeSuffix` (hoặc fallback UUID short).
   - Generate `name`: `product.name` + ` (` + join `option.valueLabel`, ` · ` + `)`.
   - Insert `Item` (productId, code, name, unit, category, providerId, sellingPrice… copy từ product defaults hoặc 0).
   - Insert `item_attribute_values` rows.
4. Trả về `{ createdCount, items: ItemEntity[] }`.

### Unique tổ hợp

- Hàm helper: `getItemByAttributeCombo(productId, combo[])` → trả `Item?` qua join với junction.
- Hoặc: tính hash JSON `{ "attr1": "optX", "attr2": "optY" }` (normalize order) → lưu cột `combo_hash` trên `Item` (unique `(productId, combo_hash)`).

### Lazy (nếu triển khai)

- Endpoint `/api/v1/products/:id/resolve-variant` + body `{ attributes: { size: "39", color: "Nâu" } }` → trả `itemId` (existing or newly created).
- Dùng trong POS / nhập kho: chọn product + thuộc tính UI → call resolve → nhận itemId → dùng vào line.

## Testing Strategy

- Unit: mock product + defs/options; test generateVariants tạo đúng count.
- E2E: product 2 def × (3+2 options) → generate → 6 items; junction 12 rows (6 item × 2 def).
- Edge: generate lần 2 → idempotent (không insert lại).
- Performance: product 5 def × 5 options mỗi → 3125 variants (nếu threshold > 3000 → warning) — test tạo xong không timeout.

## Dependencies

- Depends on: TKT-028 (ProductCrudService), TKT-029 (AttributeService), TKT-027 (schema).
- Blocks: TKT-031 (Item productId field usage), TKT-035 (Backoffice UI gọi endpoint này).

