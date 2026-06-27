# TKT-TWD-10 addLine: session locations từ kho đã chọn (storage → location) + chặn trùng

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

`addLine` mở phiên với `warehouse_location_id`/`showroom_location_id` **trùng nhau** (cùng `e44f52d8…`) vì FE không truyền kho, BE rơi về `BranchLocationResolverService` (chi nhánh cấu hình tối thiểu → 1 location mặc định cho cả kho + showroom). Đổi hợp đồng: addLine nhận **storage id** từ picker (`warehouseStorageId`/`showroomStorageId`), BE resolve mỗi storage → location mặc định qua `StorageDefaultLocationResolverService`, lưu lên phiên. Đồng thời **chặn trùng**: nếu hai location resolve ra bằng nhau → `400 TEMP_WAREHOUSE_SESSION_SAME_LOCATION`. Thay 2 field `warehouseLocationId`/`showroomLocationId` (TWD-02/03) bằng storage id (FE chỉ có storage/showroom id, không có location id).

## Deliverables

- `packages/shared-interfaces/src/inventory/temp-warehouse.ts` — `AddTempWarehouseLineBody`: bỏ `warehouseLocationId`/`showroomLocationId`, thêm `warehouseStorageId?`/`showroomStorageId?`.
- `apps/api/src/modules/inventory/temp-warehouse/dto/add-line.dto.ts` — bỏ 2 field location, thêm `warehouseStorageId?`/`showroomStorageId?` (`@IsOptional @IsUUID`).
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.ts` — inject `StorageDefaultLocationResolverService`; trong `addLine` open-session: resolve storage→location, guard trùng.
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.spec.ts` — unit cho resolve + guard.

## Acceptance Criteria

- [ ] `addLine` khi mở phiên: nếu có **đủ cặp** `warehouseStorageId`+`showroomStorageId` → `warehouseLocationId = resolveStorageTransferLocation(warehouseStorageId)`, `showroomLocationId = resolveStorageTransferLocation(showroomStorageId)`; thiếu → fallback `BranchLocationResolverService.resolve()` (như cũ).
- [ ] Sau khi resolve, nếu `warehouseLocationId === showroomLocationId` → `400 TEMP_WAREHOUSE_SESSION_SAME_LOCATION` (áp dụng cả nhánh storage lẫn fallback).
- [ ] Storage id chỉ dùng **khi mở phiên**; phiên đã tồn tại thì bỏ qua (giữ location đã chốt).
- [ ] `line.direction = dto.direction`; race re-find theo `(branch, direction)` giữ nguyên.
- [ ] Mọi truy vấn lọc `actor.organizationId`; addLine kế thừa `IdempotencyInterceptor`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + typecheck xanh.
- [ ] Spec phủ: 2 storage khác → 2 location khác; cùng storage/cùng location → 400; fallback khi thiếu storage; guard trên fallback.
- [ ] No Vietnamese trong source mới (mã lỗi English; message tái dùng `StorageDefaultLocationResolverService` vốn đã tồn tại — không thêm tiếng Việt mới).
- [ ] openapi regen ở TWD-11.

## Tech Approach

```ts
// add-line.dto.ts — thay 2 field location bằng storage
@ApiPropertyOptional({ description: 'Warehouse-side storage; resolved to its default location when opening the session' })
@IsOptional() @IsUUID()
warehouseStorageId?: string;

@ApiPropertyOptional({ description: 'Showroom-side storage; resolved to its default location when opening the session' })
@IsOptional() @IsUUID()
showroomStorageId?: string;
```

```ts
// service.addLine — open block
let warehouseLocationId: string;
let showroomLocationId: string;
if (dto.warehouseStorageId && dto.showroomStorageId) {
  warehouseLocationId = await this.storageDefaultLocationResolver
    .resolveStorageTransferLocation(dto.warehouseStorageId, actor.organizationId);
  showroomLocationId = await this.storageDefaultLocationResolver
    .resolveStorageTransferLocation(dto.showroomStorageId, actor.organizationId);
} else {
  const resolved = await this.locationResolver.resolve(dto.branchId, actor.organizationId);
  warehouseLocationId = resolved.warehouseLocationId;
  showroomLocationId = resolved.showroomLocationId;
}
if (warehouseLocationId === showroomLocationId) {
  throw new BadRequestException({
    code: 'TEMP_WAREHOUSE_SESSION_SAME_LOCATION',
    message: 'Warehouse and showroom resolve to the same location; pick distinct storages or configure distinct default locations',
  });
}
// create session { direction: dto.direction, warehouseLocationId, showroomLocationId, ... }
```

> `StorageDefaultLocationResolverService.resolveStorageTransferLocation(storageId, org, { fallbackLocationId?, errorLabel? })` đã có sẵn (đang dùng trong materializer), được `InventoryLocationModule` export → inject thẳng vào `TempWarehouseService`. Constructor thêm 1 tham số → cập nhật 2 chỗ `new TempWarehouseService(...)` trong spec.

## Testing Strategy

- Unit (`temp-warehouse.service.spec.ts`): mock `storageDefaultLocationResolver.resolveStorageTransferLocation` trả 2 location khác nhau → phiên mở đúng; trả cùng 1 location → ném `SAME_LOCATION`; không truyền storage → gọi `locationResolver.resolve`.

## Dependencies

- Depends on: TKT-TWD-03 (addLine open-per-direction)
- Blocks: TKT-TWD-11, TKT-TWD-12
