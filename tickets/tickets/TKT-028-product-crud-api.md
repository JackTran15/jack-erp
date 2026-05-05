# TKT-028 Product CRUD API

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

Triển khai CRUD service + controller cho **ProductEntity**: list (paginate + filter), create, get by ID, update, (soft) delete. Dùng `BaseCrudService` pattern hiện có.

## Deliverables

- `ProductCrudService extends BaseCrudService<ProductEntity>` (theo phong cách `InventoryStockBalanceCrudService`).
- `ProductController` + DTO validation (`CreateProductDto`, `UpdateProductDto`).
- Permission guard: `product.write`, `product.read`.
- Shared interface: export `Product` interface (tương tự `StockBalance`).

## Acceptance Criteria

- [ ] `POST /api/v1/products` → tạo product (name, description, isActive, defaultProviderId).
- [ ] `GET /api/v1/products?page=1&limit=20&search=...` → list product thuộc org.
- [ ] `GET /api/v1/products/:id` → detail (trả `product` + relations?).
- [ ] `PATCH /api/v1/products/:id` → cập nhật (name, description...).
- [ ] `DELETE /api/v1/products/:id` → soft delete (is_deleted=true hoặc is_active=false).
- [ ] Search theo `name` / `description` (ILIKE).
- [ ] Filter `isActive=true/false`.

## Definition of Done

- [ ] PR has: service, controller, DTO, shared interface, tests pass.
- [ ] Module wiring (`ProductModule` imports `ProductCrudService` + controller).
- [ ] Postman / e2e test: smoke CRUD cycle, phân trang.
- [ ] DoD: không có TODO dở; no lint; CI pass.

## Tech Approach

- Tạo thư mục `apps/api/src/modules/inventory/product/` (cùng cấp `location`, `ledger`…).
- Service: inject `Repository<ProductEntity>`, `DataSource` (như ledger, stock balance).
- Search: where name/description ILIKE (cơ chế tương tự `InventoryStockBalanceCrudService.applySearch`).
- Validation: name required, non-empty; isActive default true; defaultProviderId optional UUID FK.
- Scoping: cấp **organization** (`ScopingPolicy.ORG` hoặc lọc theo `actor.organizationId`).

## Testing Strategy

- Unit: mock repo, test service create / update logic.
- Integration (e2e): tạo product sample → list → update name → delete → list (không hiện nếu soft delete).
- Manual: Postman POST `/api/v1/products` → 201 + `id`.

## Dependencies

- Depends on: TKT-027 (ProductEntity schema).
- Blocks: TKT-030 (Variant generation service cần query product).

