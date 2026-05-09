# TKT-032 Product storage location rules (1 product / 1 vị trí / kho)

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

Enforce **ràng buộc**: trong một `StorageEntity` (kho), một **productId** chỉ được **một `locationId`**. Lưu trong bảng **product_storage_locations** hoặc validate khi phát sinh tồn (nhập kho / điều chỉnh).

## Deliverables

- Entity: `ProductStorageLocationEntity` (unique `(productId, storageId)`).
- Service: `ProductStorageLocationService` (hoặc tích hợp service khác) — CRUD mapping.
- Validation: khi **receive PO** / **stock adjustment** / **transfer** → kiểm tra item.productId + storageId (từ locationId) → nếu đã có location khác → throw error hoặc gán theo config.

## Acceptance Criteria

- [ ] Bảng `product_storage_locations`: `(product_id, storage_id, location_id)`, unique `(product_id, storage_id)`.
- [ ] API (optional): `POST /api/v1/product-storage-locations` để admin map product → location (hoặc tự động khi nhập lần đầu).
- [ ] Validate: khi nhập kho (PO receive TKT-013 flow) hoặc adjust (TKT-011) → nếu item có `productId` → check existing location → nếu khác → 400 bad request.
- [ ] Nhiều product có thể **cùng một location** (không constraint ngược).

## Definition of Done

- [ ] PR: entity + service + validation hook trên receive/adjust.
- [ ] E2E: product A → nhập location L1 (storage S1) → OK; nhập thêm biến thể khác product A → location L1 → OK; nhập location L2 (cùng S1) → 400 conflict.
- [ ] Khác kho (storage S2): product A → location L3 → OK (không bị ràng buộc với S1).
- [ ] DoD: README mô tả rule; test coverage ≥80%.

## Tech Approach

- Khi **PO receive** (tạo `stock_balance` + `ledger_entry`): trước khi post ledger → gọi `validateProductStorageLocation(productId, storageId, locationId)`:
  - Query `product_storage_locations` (productId, storageId) → nếu có record → check `location_id` == input → pass / fail.
  - Nếu chưa có record → insert mapping (auto-assign) → return OK.
  - Hoặc: yêu cầu admin setup trước → nếu chưa có mapping → throw "chưa cấu hình vị trí cho product trong kho này".
- Gọi hook cùng logic khi **stock adjustment**, **transfer from**, **GI post**.
- Tuỳ chọn: endpoint `/api/v1/products/:id/locations` để danh sách location hiện tại (group theo storage).

## Testing Strategy

- Unit: mock query `product_storage_locations`, test logic validate pass / fail.
- E2E: product + 2 biến thể → nhập location A (storage 1) → OK → nhập location B (storage 1) → 400; nhập location C (storage 2) → OK.
- Performance: product nhiều biến thể → không slowdown validation (index `(product_id, storage_id)`).

## Dependencies

- Depends on: TKT-027 (schema product_storage_locations), TKT-031 (ItemEntity.productId).
- Blocks: TKT-037 (testing e2e luồng nhập kho).

