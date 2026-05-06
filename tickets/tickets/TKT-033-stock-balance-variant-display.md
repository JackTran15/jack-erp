# TKT-033 Stock balance variant display API

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

Điều chỉnh `InventoryStockBalanceCrudService` + API list tồn: join `item.product`, hiển thị **productName**, **variant_label** thay thế field `itemVariants` hiện tại (chuỗi ghép category/unit/desc).

## Deliverables

- `StockBalanceEntity` list response: thêm field `productName`, `variant_label` (hoặc đổi tên `itemVariants` → `variantDisplay`).
- Service: join `item.product`; format helper cập nhật.
- Shared interface: `StockBalance` interface thêm `productName?`, `variantLabel?`.

## Acceptance Criteria

- [ ] `GET /api/v1/inventory/stock/balances` → mỗi dòng có `productName` (từ `item.product.name`), `variantLabel` (từ `item.variant_label` hoặc join option nếu không denorm).
- [ ] Legacy item (`product_id` null) → `productName` null / empty; `variantLabel` fallback chuỗi cũ (category · unit · desc).
- [ ] Search theo `productName` (thêm vào `applySearch`).
- [ ] Filter `productId=xxx` (nếu muốn lọc tồn theo product).

## Definition of Done

- [ ] PR: service join product, DTO response; tests pass.
- [ ] E2E: tạo product + variant → nhập kho → GET stock balances → check `productName`, `variantLabel` đúng.
- [ ] Legacy: item cũ → GET → trả `itemName`, `itemCode`, `itemVariants` (hoặc `variantDisplay`) như cũ.
- [ ] DoD: không breaking change API trước (hoặc version API v2 nếu cần).

## Tech Approach

- `InventoryStockBalanceCrudService.configureListQuery`: đã join `item`; thêm `.leftJoinAndSelect('item.product', 'product')`.
- `flattenForList`:
  ```ts
  productName: item?.product?.name ?? '',
  variantLabel: item?.variant_label ?? formatItemVariantSummary(item), // fallback
  ```
- Hoặc: đổi tên `itemVariants` → `variantDisplay` để đồng nhất.
- Search: `orWhere('product.name ILIKE :search')`.
- Filter: `qb.andWhere('item.productId = :productId')` nếu có param.

## Testing Strategy

- Unit: mock stock balance row + item + product; test flatten output.
- E2E: product + variant → stock balance insert → GET → check JSON.
- Legacy: item không product → GET → check fallback chuỗi cũ.
- Regression: existing tests `InventoryStockBalanceCrudService` → pass.

## Dependencies

- Depends on: TKT-031 (Item.productId, variant_label).
- Blocks: TKT-035 (Backoffice UI gọi API này).

