# TKT-WHC-02 Auto-gen mã kho + Mã kho display-only (BE)

## Epic

[EPIC-21062026 Warehouse Code Auto-Generation](../epics/EPIC-21062026-warehouse-code-autogen.md)

## Summary

Tự sinh `storages.code` ở **mọi** đường tạo storage và bỏ `code` khỏi field cho-sửa của form CRUD. Đảm bảo không storage nào sinh ra mà thiếu mã (sẽ tái tạo ô trống mà TKT-WHC-04 vừa backfill). Pattern y hệt nhà cung cấp NCC (`provider-crud.service.ts`).

Hai creation path xử lý ở ticket này:
1. **Generic CRUD** (form FE dùng): `InventoryStorageCrudService.beforeCreate`.
2. **Endpoint chuyên dụng** `POST /inventory/storages`: `InventoryLocationService.createStorage`.

(Path thứ 3 — luồng tạo chi nhánh — ở TKT-WHC-03.)

## Deliverables

- `apps/api/src/modules/inventory/location/storage-crud.service.ts`:
  - Đổi config field `code`: bỏ `required: true`, thêm `readOnly: true` (vẫn `searchableFields: ['name','code']`).
  - Thêm `beforeCreate(payload, actor)` sinh `payload.code` nếu chưa có, qua `DocumentNumberingService.generate(DocumentType.WAREHOUSE, actor.branchId, actor)`.
  - Inject `DocumentNumberingService` vào constructor.
- `apps/api/src/modules/inventory/location/inventory-location.service.ts` — trong `createStorage`, set `code` tự sinh khi tạo `StorageEntity` (cùng `DocumentNumberingService`). Inject service nếu chưa có.
- `apps/api/src/modules/inventory/location/inventory-location.module.ts` (hoặc module tương ứng) — đảm bảo `DocumentNumberingModule`/`DocumentNumberingService` đã được import/provide (provider-crud đã dùng → khả năng đã có; xác nhận).

## Acceptance Criteria

- [ ] `code` trong `INVENTORY_STORAGE_ENTITY_CONFIG` là `readOnly: true`, không `required`.
- [ ] Tạo storage qua `POST /admin/entities/inventory-storages/records` không có `code` trong body → bản ghi có `code = WHxxxxxx`.
- [ ] Tạo storage qua `POST /inventory/storages` → bản ghi có `code = WHxxxxxx`.
- [ ] Mã sinh ra org-scoped, liên tục, không trùng giữa hai path (cùng counter rule `WAREHOUSE`).
- [ ] Mọi query vẫn filter theo `actor.organizationId` (+ `branchId`); mutation kế thừa `IdempotencyInterceptor` (không tự xử lý lại).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Spec phủ: beforeCreate sinh code khi rỗng; không ghi đè code nếu đã truyền (giữ hành vi giống provider-crud).
- [ ] Không Vietnamese trong source backend.

## Tech Approach

```ts
// storage-crud.service.ts — config
{ key: 'code', label: 'Mã kho', type: 'string', readOnly: true },
```

```ts
// storage-crud.service.ts — beforeCreate (theo provider-crud.service.ts)
protected override async beforeCreate(
  payload: Record<string, any>,
  actor: ActorContext,
): Promise<Record<string, any>> {
  if (!payload.code) {
    payload.code = await this.docNumbering.generate(
      DocumentType.WAREHOUSE,
      actor.branchId,
      actor,
    );
  }
  return payload;
}
```

```ts
// inventory-location.service.ts — createStorage (trong transaction)
const code = dto?.code ?? (await this.docNumbering.generate(
  DocumentType.WAREHOUSE, dto.branchId, actor,
));
const storage = await manager.save(
  manager.create(StorageEntity, { code, name: dto.name, branchId: dto.branchId, /* ... */ }),
);
```

Lưu ý transaction: `generate` chạy `atomicIncrement` trong transaction riêng — gọi `generate` **trước** khi mở transaction tạo storage (hoặc ngoài tx của `createStorage`) để tránh nesting/deadlock; provider-crud gọi trong `beforeCreate` (ngoài tx save) là an toàn.

## Testing Strategy

- Unit (`storage-crud.service.spec.ts` mới hoặc mở rộng): mock `DocumentNumberingService.generate`; assert beforeCreate set `code` khi rỗng, giữ nguyên khi đã có.
- Unit (`inventory-location.service.spec.ts` nếu có): `createStorage` set `code`.

## Dependencies

- Depends on: TKT-WHC-01
- Blocks: TKT-WHC-05, TKT-WHC-06
- Phối hợp với: TKT-WHC-04 (cùng prefix/padding `WH`/6 để counter khớp high-water)
