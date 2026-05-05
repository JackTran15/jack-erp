# TKT-029 Product attribute API

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

CRUD cho **ProductAttributeDefinitionEntity** + **ProductAttributeOptionEntity**: tạo/sửa chiều thuộc tính (Size, Màu…) và giá trị (39, 40, Nâu…) thuộc từng product. Nested route hoặc endpoints riêng.

## Deliverables

- Service: `ProductAttributeService` (hoặc tích hợp `ProductCrudService`).
- Controller endpoints: POST/PATCH/DELETE **definitions**, POST/PATCH/DELETE **options**.
- DTO: `CreateAttributeDefinitionDto`, `CreateAttributeOptionDto`.
- Permission: cùng `product.write`.

## Acceptance Criteria

- [ ] `POST /api/v1/products/:productId/attributes` → tạo attribute definition (name, sortOrder).
- [ ] `GET /api/v1/products/:productId/attributes` → list definitions + options nested (eager).
- [ ] `POST /api/v1/products/:productId/attributes/:attrDefId/options` → tạo option (valueLabel, sortOrder, codeSuffix?).
- [ ] `PATCH /api/v1/products/:productId/attributes/:id` → cập nhật definition name / sort.
- [ ] `DELETE /api/v1/products/:productId/attributes/:id` → soft/hard delete definition (và cascade option hoặc chặn nếu đã dùng).
- [ ] Unique: trong cùng product, `(productId, name)` definition không trùng; trong definition, option `valueLabel` không trùng (hoặc normalized).

## Definition of Done

- [ ] PR: service + controller + DTO; TypeORM FK cascade options set.
- [ ] E2E test: tạo product → thêm Size(39,40) + Màu(Nâu,Đen) → list → xoá option → delete definition (nếu không còn variant).
- [ ] Error case: thêm trùng tên definition → 400 duplicate; hoặc 409 conflict.

## Tech Approach

- Tạo `ProductAttributeService` (hoặc gộp vào `ProductCrudService` nếu logic ít).
- Endpoints nested: `/products/:id/attributes`, `/products/:id/attributes/:attrId/options`.
- Validation: name non-empty; sortOrder int ≥0; valueLabel required.
- Unique check: insert lỗi → catch `QueryFailedError` hoặc pre-query exist → throw ConflictException.
- Cascade FK: khi định nghĩa bị xoá → `cascade: true` tự xoá options (hoặc restrict nếu có item_attribute_values).
- Read: join eager `definition.options` khi GET product attributes.

## Testing Strategy

- Unit: mock repo product + attribute; test duplicate name throw.
- E2E: CRUD cycle tạo 2 chiều, mỗi chiều 3 options; fetch product + attributes → JSON chứa nested options.
- Edge: xoá definition đã dùng → lỗi FK constraint → xác nhận service throw / rollback.

## Dependencies

- Depends on: TKT-027 (schema definitions & options), TKT-028 (ProductEntity exists).
- Blocks: TKT-030 (Variant generation cần query attribute options).

