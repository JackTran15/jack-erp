# TKT-IIF-03 Item update: editable nested providers/units + brand

## Epic

[EPIC-31052026 Inventory Item Form Refactor](../epics/EPIC-31052026-inventory-item-form-refactor.md)

## Summary

`InventoryItemCrudService.update()` hiện **strip** `providers`/`units`/`barcodes`/`threshold` (qua `stripDerivedFields`) và `UpdateItemDto` thiếu `brand`/`brandId` + các field phase-2. Vì epic hỗ trợ **edit** form giàu, ticket này mở rộng `UpdateItemDto` cho ngang `CreateItemDto` (phần cần edit) và cho `update()` **reconcile** `providers[]` + `units[]` trong transaction (delete + reinsert, chuẩn hóa giống create). Barcodes/threshold giữ nguyên hành vi hiện tại (ngoài scope).

## Deliverables

- `apps/api/src/modules/inventory/location/dto/update-item.dto.ts` — thêm: `brand?`, `brandId?`, `itemType?`, `packageWeightGram?`, `packageLengthCm?`, `packageWidthCm?`, `packageHeightCm?`, `oddSize?`, `isGoldSilver?`, `manageBarcodePerUnit?`, `providers?: CreateItemProviderInput[]`, `units?: CreateItemUnitInput[]` (reuse các nested input type của create).
- `apps/api/src/modules/inventory/location/item-crud.service.ts` — `update()`:
  - Tách `providers`/`units` ra khỏi payload trước `super.update()`.
  - Nếu `providers` **được gửi** (định nghĩa, kể cả mảng rỗng) → trong cùng transaction: `delete ItemProviderEntity where itemId` rồi `saveProviders(...)` (tái dùng helper hiện có, đảm bảo đúng 1 primary).
  - Nếu `units` được gửi → `delete ItemUnitEntity where itemId` rồi `saveUnits(...)`.
  - Resolve `brandId` → set `brandId` + denormalize `brand` (dùng logic từ TKT-IIF-01).
  - **Phân biệt "không gửi" vs "gửi mảng rỗng"**: chỉ reconcile khi key xuất hiện trong payload, tránh xóa nhầm khi caller chỉ patch 1 field.

## Acceptance Criteria

- [ ] PATCH item với `providers[]` mới (2 dòng, 1 primary) → DB còn đúng 2 dòng, 1 primary; dòng cũ bị xóa.
- [ ] PATCH item với `units[]` mới → reconcile đúng `ratio`/`purchasePrice`/`sellPrice`/`isDefaultSell`/`isDefaultBuy` (đúng 1 default mỗi loại).
- [ ] PATCH item **không** kèm `providers`/`units` → KHÔNG đụng các bảng con (không xóa nhầm).
- [ ] PATCH `brandId` hợp lệ → cập nhật `brandId` + `brand`; brandId lạ org → 400/404.
- [ ] Update vẫn idempotent qua `IdempotencyInterceptor`; reconcile deterministic.
- [ ] Mọi thao tác filter `actor.organizationId`; transaction-wrapped, không để trạng thái nửa vời.

## Definition of Done

- [ ] PR pass `pnpm --filter @erp/api test` + lint.
- [ ] Spec `item-crud.service.spec.ts`: update reconcile providers/units (gồm case "không gửi không xóa"), update brandId.
- [ ] E2E (TKT-IIF-09) cover create→edit→reload.
- [ ] `synchronize` false (ticket này không có migration mới).
- [ ] `pnpm openapi:generate` + commit snapshot nếu diff.
- [ ] No Vietnamese trong backend source.

## Tech Approach

```ts
override async update(id, payload, actor) {
  const normalized = normalizePayload(payload);
  const hasProviders = 'providers' in normalized;
  const hasUnits = 'units' in normalized;
  const { providers, units, ...rest } = normalized;

  return this.dataSource.transaction(async (manager) => {
    if (rest.brandId !== undefined) {
      const brand = await manager.findOne(BrandEntity, { where: { id: rest.brandId, organizationId: actor.organizationId } });
      if (!brand) throw new BadRequestException('Brand not found in organization');
      rest.brand = brand.name;
    }
    const saved = await super.update(id, stripDerivedFields(rest), actor);
    if (hasProviders) {
      await manager.delete(ItemProviderEntity, { itemId: id, organizationId: actor.organizationId });
      await this.saveProviders(manager, id, actor, providers);
    }
    if (hasUnits) {
      await manager.delete(ItemUnitEntity, { itemId: id, organizationId: actor.organizationId });
      await this.saveUnits(manager, id, actor, units);
    }
    return saved;
  });
}
```

> Lưu ý: `super.update` có thể tự mở transaction — nếu vậy chuyển sang tự load+save trong cùng `manager` thay vì gọi `super.update` (quyết định ở implement sau khi đọc `BaseCrudService.update`). Mục tiêu: item + nested cùng 1 transaction.

## Testing Strategy

- Unit: 4 case ở Acceptance Criteria.
- E2E: thuộc TKT-IIF-09.

## Dependencies

- Depends on: TKT-IIF-01 (brandId + helper resolve brand).
- Blocks: TKT-IIF-07 (edit providers), TKT-IIF-08 (edit mode).
