# TKT-IIF-01 Brand master entity + item.brandId

## Epic

[EPIC-31052026 Inventory Item Form Refactor](../epics/EPIC-31052026-inventory-item-form-refactor.md)

## Summary

Hiện "Thương hiệu" chỉ là cột free-text `brand` trên item — không list/xóa được. Ticket này tạo **Brand là master-data thật**: entity `BrandEntity`, đăng ký vào generic CRUD platform (`inventory-brands`), và thêm FK `brandId` lên `ItemEntity`. Cột `brand` (string) được giữ lại và denormalize từ tên brand để các consumer cũ (stock-summary filter theo `brand`) không vỡ.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-AddBrandsAndItemBrandId.ts` (new) — hand-written:
  - `CREATE TABLE inventory_brands` (id uuid PK, organization_id uuid, name varchar, created_at/updated_at/deleted_at, created_by) + unique `(organization_id, name)`.
  - `ALTER TABLE items ADD COLUMN brand_id uuid NULL` + FK → `inventory_brands(id)` (xác nhận tên bảng item thực tế từ `@Entity` trong `item.entity.ts` trước khi viết).
- `apps/api/src/modules/inventory/location/brand.entity.ts` — `BrandEntity` (UUID PK, `organizationId`, `name`, `@CreateDateColumn`/`@UpdateDateColumn` UTC, `@DeleteDateColumn`), `@Unique(['organizationId','name'])`.
- `apps/api/src/modules/inventory/location/dto/{create,update}-brand.dto.ts` — `name` (class-validator + `@ApiProperty`).
- `apps/api/src/modules/inventory/location/brand-crud.service.ts` — `BrandCrudService extends BaseCrudService<BrandEntity, CreateBrandDto, UpdateBrandDto>` + `BRAND_ENTITY_CONFIG: CrudEntityConfig` + `BRAND_SERVICE_TOKEN`.
- `apps/api/src/modules/inventory/location/inventory-location.module.ts` — đăng ký `BrandEntity` vào `TypeOrmModule.forFeature`, provider token, và `registerEntity(BRAND_ENTITY_CONFIG, BRAND_SERVICE_TOKEN)` trong `onModuleInit`.
- `apps/api/src/modules/inventory/location/item.entity.ts` — thêm cột `brandId?: string` (giữ `brand?: string`).
- `apps/api/src/modules/inventory/location/dto/create-item.dto.ts` + `update-item.dto.ts` — thêm `brandId?: string` (`@IsUUID`, optional).
- `apps/api/src/modules/inventory/location/item-crud.service.ts` — trong `create`/`update`: nếu `brandId` có, load brand (cùng org), set `item.brandId` + `item.brand = brand.name`.

## Acceptance Criteria

- [ ] `GET/POST/PATCH/DELETE /admin/entities/inventory-brands/records` hoạt động, scope `ScopingPolicy.ORGANIZATION`, deletion `SOFT`.
- [ ] Mọi query Brand filter theo `actor.organizationId`; không leak cross-tenant; unique tên brand trong 1 org.
- [ ] Tạo item với `brandId` hợp lệ → `item.brandId` set + `item.brand` = tên brand. `brandId` không thuộc org → 400/404 (không silent).
- [ ] Mutation kế thừa `IdempotencyInterceptor` (không tự cài lại).
- [ ] Migration chạy được trên DB có item cũ: `brand_id` NULL, `brand` string giữ nguyên.

## Definition of Done

- [ ] PR pass `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint`.
- [ ] Spec: `brand-crud.service.spec.ts` (happy path + org-scope + unique conflict) + item create với brandId.
- [ ] `synchronize` vẫn false; chỉ migration đụng schema.
- [ ] Chạy `pnpm openapi:generate`; commit `openapi.snapshot.json` + `schema.ts` nếu có diff (generic endpoint có thể no-op).
- [ ] No Vietnamese trong backend source (entity/dto/service/swagger/log/comment đều English).

## Tech Approach

```ts
@Entity('inventory_brands')
@Unique(['organizationId', 'name'])
export class BrandEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') organizationId: string;
  @Column({ length: 150 }) name: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
  @DeleteDateColumn() deletedAt?: Date;
  @Column({ type: 'uuid', nullable: true }) createdBy?: string;
}

export const BRAND_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-brands',
  displayName: 'Thương hiệu',
  apiResource: 'inventory/brands',
  idField: 'id',
  fields: [{ key: 'name', label: 'Tên thương hiệu', type: 'string', required: true }],
  searchableFields: ['name'],
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
  permissions: { create: 'inventory.write', read: 'inventory.read', update: 'inventory.write', delete: 'inventory.write' },
};
```

Trong `item-crud.service.ts` create/update: resolve brand bằng `manager.findOne(BrandEntity, { where: { id: brandId, organizationId: actor.organizationId } })`; nếu không thấy → `BadRequestException('Brand not found in organization')`.

## Testing Strategy

- Unit (`brand-crud.service.spec.ts`): seed org → create/list/delete; unique conflict; cross-org isolation.
- Unit bổ sung trong item service spec: create item có brandId set cả `brandId` + `brand`.

## Dependencies

- Depends on: EPIC-010 (ItemEntity + InventoryItemCrudService).
- Blocks: TKT-IIF-03 (update brandId), TKT-IIF-04 (FE brand hooks).
