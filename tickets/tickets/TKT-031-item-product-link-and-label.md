# TKT-031 Item: productId link & variant_label

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

Chỉnh `ItemEntity` + `ItemCrudService` / query: **sử dụng `product_id`**, ghép `variant_label` khi cần (denorm hoặc runtime join). Hỗ trợ legacy item không có `productId` (nullable).

## Deliverables

- `ItemEntity`: thuộc tính `productId`, relation `@ManyToOne(() => ProductEntity)`.
- Logic cập nhật `variant_label` khi item tạo / thuộc tính đổi (hoặc computed runtime).
- `ItemCrudService`: join product khi list / get; filter theo `productId`.

## Acceptance Criteria

- [ ] `GET /api/v1/items?productId=xxx` → list item thuộc product đó.
- [ ] `GET /api/v1/items/:id` → trả `item` + `product` (nested hoặc field `productName`).
- [ ] Khi biến thể tạo (TKT-030) → `variant_label` sinh từ option labels → lưu vào DB.
- [ ] Legacy item (`product_id` null) → list / query bình thường; không lỗi FK.
- [ ] Update service: khi `variant_label` cột nullable → hỗ trợ re-compute nếu attribute option đổi (optional v1).

## Definition of Done

- [ ] PR: `ItemEntity` có `productId`, relation, `variant_label` column; service join product.
- [ ] E2E: tạo product + biến thể (TKT-030) → GET item → trả `productId`, `variant_label` đúng.
- [ ] Legacy test: tạo item không `productId` (POST `/api/v1/items` cũ) → vẫn lưu được, list không lỗi.
- [ ] DoD: no regression tests fail (existing item queries).

## Tech Approach

- Thêm vào `ItemEntity`:
  ```ts
  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string;

  @ManyToOne(() => ProductEntity, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @Column({ name: 'variant_label', nullable: true })
  variantLabel?: string;
  ```
- `ItemCrudService.configureListQuery`: join product → `.leftJoinAndSelect('item.product', 'product')`.
- `applySearch`: thêm `product.name ILIKE :search`.
- Logic ghép `variant_label`:
  - Khi **generate variant** (TKT-030) → service gọi helper `buildVariantLabel(itemId)` → query junction + options → ghép chuỗi "39 · Nâu · Bóng" → update `item.variant_label`.
  - Nếu không muốn cột: computed runtime join — nhưng cột denorm nhanh hơn (theo plan gợi ý).

## Testing Strategy

- Unit: mock repo; test join product.
- E2E: create product + variant (PV-030) → GET item → check `productId`, `variant_label`.
- Legacy: POST item (ko productId) → 201; GET item → productId null, variant_label null → OK.
- Regression: existing test suite item CRUD → pass không thay đổi behavior.

## Dependencies

- Depends on: TKT-027 (schema product_id), TKT-030 (sinh variant sử dụng productId).
- Blocks: TKT-032 (storage location rule dùng productId), TKT-033 (stock display), TKT-034 (POS validation), TKT-036 (migration).

