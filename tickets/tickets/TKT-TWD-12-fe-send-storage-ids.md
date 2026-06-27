# TKT-TWD-12 FE: truyền kho đã chọn (storage ids) xuống addLine

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Map lựa chọn "Kho xuất"/"Kho nhập" (`filters.sourceWarehouse`/`destinationWarehouse`) thành `warehouseStorageId`/`showroomStorageId` theo hướng, rồi gửi xuống `addLine` để phiên mở với đúng kho (hết trùng location). Phía storage là storage id; phía showroom là showroom id → quy về `showroom.storageId`.

## Deliverables

- `apps/pos-web/src/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers.ts` — `mapDraftToAddBody` nhận thêm `warehouseStorageId`/`showroomStorageId` (hoặc set trong actions).
- `apps/pos-web/src/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions.ts` — `handleAddRow` tính storage ids theo direction từ `data.filters`/`data.storages`/`data.showrooms`/`data.direction`, gắn vào body.

## Acceptance Criteria

- [ ] `warehouseStorageId` = giá trị picker phía **kho** (storage id); `showroomStorageId` = `storageId` của showroom được chọn (tra trong `data.showrooms` theo id).
- [ ] Mapping theo hướng:
  - `w2s`: warehouseStorageId = `filters.sourceWarehouse`; showroomStorageId = showroom(`filters.destinationWarehouse`).storageId.
  - `s2w`: warehouseStorageId = `filters.destinationWarehouse`; showroomStorageId = showroom(`filters.sourceWarehouse`).storageId.
- [ ] Bỏ trống/không resolve được → không gửi field đó (BE fallback resolver).
- [ ] addLine body gửi kèm 2 field; phiên mở ra có `warehouse_location_id` ≠ `showroom_location_id` (khi 2 kho khác nhau).
- [ ] Tuân thủ pos-web CLAUDE.md (service-only API, named export, không `index.ts`).

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` xanh.
- [ ] Verify trên app: chọn "Warehouse B" + "CCCC - Showroom" → thêm dòng → DB phiên có 2 location khác nhau (không còn `e44f52d8…` trùng).
- [ ] Lỗi `TEMP_WAREHOUSE_SESSION_SAME_LOCATION` (nếu BE trả) hiển thị qua `PosErrorDialog`, không crash.

## Tech Approach

```ts
// handleAddRow (trong actions) — tính storage ids theo direction
const showroomStorageOf = (id: string) =>
  data.showrooms.find((s) => s.id === id)?.storageId;

const isW2s = data.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;
const warehouseStorageId = isW2s
  ? data.filters.sourceWarehouse
  : data.filters.destinationWarehouse;
const showroomStorageId = isW2s
  ? showroomStorageOf(data.filters.destinationWarehouse)
  : showroomStorageOf(data.filters.sourceWarehouse);

const body = mapDraftToAddBody(data.toolbarDraft, data.branchId, data.direction);
if (warehouseStorageId) body.warehouseStorageId = warehouseStorageId;
if (showroomStorageId) body.showroomStorageId = showroomStorageId;
```

> `data.showrooms` là `InventoryShowroomOption[]` (có `storageId`); `data.storages` là `InventoryStorageOption[]`. Picker option chỉ `{id,name}` nên phải tra ngược `storageId` của showroom từ `data.showrooms`.

## Dependencies

- Depends on: TKT-TWD-11
- Blocks: —
