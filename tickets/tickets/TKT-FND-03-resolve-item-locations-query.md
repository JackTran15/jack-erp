# TKT-FND-03 Domain service vị trí product-uniform + ResolveItemLocations query

## Epic

[EPIC-18062026 Inventory Foundation](../epics/EPIC-18062026-inventory-foundation.md)

## Layer

🟦 Backend (CQRS query đọc + domain service ghi) + 🟩 Frontend (hook dùng chung).

## Summary

Hai mảnh dùng chung cho cả 3 nghiệp vụ:

1. **Read** — `ResolveItemLocationsQuery`: nhận **list variant + branch (+ storageId tuỳ chọn)**, trả vị trí gợi ý mỗi variant. Có `storageId` → chỉ tra trong kho đó (**không** tra kho mặc định). Không có → tra kho `isDefaultReceiving` của chi nhánh. Mọi variant cùng `productId` trả **cùng** `locationId`.
2. **Write** — `ProductLocationService.assertProductUniformLocation(lines)` + `upsertItemStorageLocation(...)`: enforce "tất cả variant cùng mẫu mã nằm 1 vị trí" khi command B/C/D gán/ghi vị trí.

## Deliverables

- `apps/api/src/modules/inventory/location/dto/resolve-item-locations.dto.ts`:
  ```ts
  export class ResolveItemLocationsDto {
    @IsArray() @ArrayNotEmpty() @IsUUID('4', { each: true }) variantItemIds: string[];
    @IsUUID() branchId: string;
    @IsOptional() @IsUUID() storageId?: string; // nếu có → ưu tiên kho này, bỏ qua mặc định
  }
  ```
- `apps/api/src/modules/inventory/location/queries/resolve-item-locations.query.ts` + `.handler.ts` — `@QueryHandler`:
  1. Xác định storage: `storageId` payload → dùng thẳng; else `storages.is_default_receiving` của `branchId`; else null.
  2. Map variant → `productId`; **gom theo product**, resolve **một** vị trí/product:
     - ưu tiên `item_storage_locations(itemId, storageId)` (preferred shelf) của bất kỳ variant trong product;
     - else bin giữ nhiều hàng nhất từ `stock_balance` (mirror `transfer-order.resolveSourceLocation`);
     - else location `isDefault`/`isUnassigned` của storage.
  3. Áp vị trí product cho **mọi** variant của product đó.
  4. Trả inline: `[{ itemId, productId, storageId, locationId, locationCode, locationName, source: 'preferred'|'stock'|'default'|'none' }]`.
- `apps/api/src/modules/inventory/location/controllers/resolve-item-locations.controller.ts` — `POST /v2/inventory/items/resolve-locations`, guards + `@RequirePermission('inventory.read')` + `@RequireBranchScope()`, dispatch `QueryBus`.
- `apps/api/src/modules/inventory/location/services/product-location.service.ts` — domain service:
  ```ts
  // ném 422 nếu 2 variant cùng productId map 2 locationId khác nhau trong cùng payload/kho
  assertProductUniformLocation(lines: { itemId: string; productId: string; locationId: string }[]): void
  // ghi item_storage_locations đồng bộ cho mọi sibling variant cùng product
  async upsertUniformItemStorageLocation(manager, { productId, storageId, locationId, actor }): Promise<void>
  ```
- `packages/shared-interfaces/src/inventory/resolve-item-locations.ts` — type `ResolvedItemLocation`.
- `apps/backoffice-web/src/hooks/useResolveItemLocations.ts` — hook react-query gọi endpoint, trả map theo `itemId` để form autofill.

## Acceptance Criteria

- [ ] Payload có `storageId` → resolve chỉ trong kho đó; bỏ qua kho mặc định.
- [ ] Payload không `storageId` → dùng kho `isDefaultReceiving` của `branchId`; không có kho mặc định → `source: 'none'` (FE để trống, không lỗi).
- [ ] Mọi variant cùng `productId` trong kết quả có **cùng** `locationId`.
- [ ] `assertProductUniformLocation` ném 422 khi phát hiện 2 vị trí khác nhau cho 1 product.
- [ ] `upsertUniformItemStorageLocation` ghi cùng `locationId` cho tất cả sibling variant.
- [ ] Scope `organizationId` + `branchId`; storage phải thuộc chi nhánh.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] Spec: storageId ưu tiên; fallback default-receiving; product-uniform (2 variant 1 product → 1 vị trí); no-default → none; reject storage khác branch.
- [ ] `pnpm openapi:generate` chạy, snapshot + `schema.ts` commit.
- [ ] Source/Swagger tiếng Anh.

## Tech Approach

- Tham chiếu (không sửa) `resolveBranchItemLocations` (POS) cho ý tưởng main-storage-wins + fallback default location, nhưng đây là query CQRS **mới**, input theo list variant + storageId tuỳ chọn.
- Resolve theo product (RAM) tránh N+1: 1 query `item_storage_locations`, 1 query `stock_balance` theo `(itemId in …, storageId)`, gom JS (xem [[feedback_prefer_in_memory_aggregation]], [[feedback_inline_relations_over_root_map]]).

## Dependencies

- Requires: TKT-FND-02 (`isDefaultReceiving`).
- Blocks: TKT-STX-01, TKT-GRV-01, TKT-GIV-01 (command gọi `ProductLocationService`); TKT-STX-02/GRV-02/GIV-02 (FE gọi hook).
