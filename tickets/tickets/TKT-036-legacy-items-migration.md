# TKT-036 Legacy items migration

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

Script migrate **item hiện có** (`product_id` null) → tuỳ chọn: **giữ null** (legacy) hoặc **auto-wrap mỗi item thành 1 product 1 variant** (product name = item name). Rollback-able.

## Deliverables

- Migration script hoặc NestJS CLI command `npm run migrate:legacy-items`.
- Logic:
  - **Option A**: không làm gì (item `productId` null = legacy item, vẫn hoạt động).
  - **Option B**: foreach item không `productId` → tạo product (name = item.name) → update item.productId → không tạo attribute (0 chiều = 1 biến thể).
- Rollback: down script xoá product tạo tự động (hoặc đánh dấu `migrated=true` để rollback).

## Acceptance Criteria

- [ ] Chạy script → item cũ được gán `productId` (nếu chọn option B) hoặc giữ nguyên null (option A).
- [ ] Không mất dữ liệu item / stock_balance / ledger.
- [ ] Rollback: chạy script down → item quay lại `productId` null (nếu option B).
- [ ] Test: staging có 100 item cũ → migrate → check tất cả có `productId` hoặc null tuỳ logic.

## Definition of Done

- [ ] PR: script migration (TS + TypeORM DataSource) hoặc NestJS command.
- [ ] Chạy thành công staging replica (snapshot DB trước).
- [ ] DoD: README hướng dẫn rollback; commit message ghi rõ chiến lược (A or B).

## Tech Approach

### Option A: không migrate (khuyến nghị v1 nhanh)

- Item `productId` null → vẫn bán/nhập được; UI hiển thị `itemName` / `itemCode` thay `productName` + `variant_label`.
- Sau có thể admin thủ công gán hoặc tạo product cho item quan trọng.

### Option B: auto-wrap

- Query `SELECT * FROM items WHERE product_id IS NULL`.
- Foreach item:
  - Insert `products` (name = item.name, description = item.description, defaultProviderId = item.providerId, …).
  - Update `items SET product_id = <newProductId> WHERE id = <itemId>`.
  - Không tạo `item_attribute_values` (0 attribute = 1 variant).
- Rollback: query product có `auto_migrated = true` (cần thêm column) → delete product → update item `product_id` null.

### Code

```ts
// apps/api/src/scripts/migrate-legacy-items.ts
import { DataSource } from 'typeorm';
import { ItemEntity, ProductEntity } from '../modules/inventory/...';

async function main() {
  const ds = await new DataSource({...}).initialize();
  const itemRepo = ds.getRepository(ItemEntity);
  const productRepo = ds.getRepository(ProductEntity);
  
  const legacyItems = await itemRepo.find({ where: { productId: IsNull() } });
  for (const item of legacyItems) {
    const product = productRepo.create({
      organizationId: item.organizationId,
      name: item.name,
      description: item.description,
      isActive: item.isActive,
      autoMigrated: true, // cột bool để đánh dấu
    });
    await productRepo.save(product);
    item.productId = product.id;
    await itemRepo.save(item);
  }
  console.log(`Migrated ${legacyItems.length} items`);
  await ds.destroy();
}
main();
```

## Testing Strategy

- Unit: không (pure data script).
- Staging: clone DB prod → chạy script → verify count; rollback → verify null.
- Manual: tạo item test không productId → run script → check productId assigned.

## Dependencies

- Depends on: TKT-031 (Item.productId nullable).
- Blocks: TKT-037 (test coverage migration success).

