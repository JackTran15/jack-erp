# TKT-SUP-02 Supplier Group CRUD service + registration

## Epic

[EPIC-29052026 Supplier & Supplier Group management](../epics/EPIC-29052026-supplier-management.md)

## Layer

🟦 Backend only.

## Summary

Đăng ký entity `provider-groups` lên generic CRUD platform: service extends `BaseCrudService`, validate cha (tồn tại + không tự làm cha), resolve `parentGroupName` cho list, và register trong `InventoryLocationModule`. Sau ticket này `/admin/entities/provider-groups/records` hoạt động đầy đủ.

## Deliverables

- `apps/api/src/modules/inventory/location/supplier-group-crud.service.ts`:
  - `export const PROVIDER_GROUP_SERVICE_TOKEN = 'ProviderGroupCrudService'`.
  - `ProviderGroupCrudService extends BaseCrudService<SupplierGroupEntity, Record<string,any>, Record<string,any>>`, inject `@InjectRepository(SupplierGroupEntity)` + `DataSource`.
  - `beforeCreate`/`beforeUpdate`: normalize `parentGroupId === '' | null → undefined`; nếu set → verify tồn tại trong org; `beforeUpdate` reject `parentGroupId === id` (no self-parent). Mirror `accounting/coa/coa.service.ts`.
  - `configureListQuery` → `leftJoinAndSelect('entity.parentGroup','parentGroup')`; `getByIdRelations` → `['parentGroup']`; `transformListResults` → gắn `parentGroupName = parentGroup?.name ?? ''`.
  - `export const PROVIDER_GROUP_ENTITY_CONFIG: CrudEntityConfig`:
    - `entityKey:'provider-groups'`, `displayName:'Nhóm nhà cung cấp'`, `apiResource:'inventory/provider-groups'`, `idField:'id'`.
    - `fields`: `code` (string, required), `name` (string, required), `parentGroupName` (string, readOnly — list col), `parentGroupId` (`type:'relation'`, `relationEntity:'provider-groups'`, `hideInList:true`), `description` (string), `isActive` (boolean), `createdAt` (date, hideInList).
    - `searchableFields:['code','name']`; filter `isActive` select (Có/Không).
    - `permissions` inventory.read/write; `scopingPolicy: ORGANIZATION`; `deletionPolicy: HARD`.
- `apps/api/src/modules/inventory/location/inventory-location.module.ts`:
  - Thêm `SupplierGroupEntity` vào `TypeOrmModule.forFeature([...])`.
  - Thêm `ProviderGroupCrudService` + `{ provide: PROVIDER_GROUP_SERVICE_TOKEN, useExisting: ProviderGroupCrudService }` vào `providers`.
  - Trong `onModuleInit`: `this.entityRegistry.registerEntity(PROVIDER_GROUP_ENTITY_CONFIG, PROVIDER_GROUP_SERVICE_TOKEN)`.
- (Tuỳ chọn) `dto/supplier-group.dto.ts` — `CreateSupplierGroupDto`/`UpdateSupplierGroupDto` (class-validator) làm generic param/tài liệu; generic path không validate nên không bắt buộc.

## Acceptance Criteria

- [ ] `GET /admin/entities/provider-groups` trả config; `GET /admin/entities/provider-groups/records` list có cột `parentGroupName` resolved.
- [ ] `POST …/provider-groups/records {code,name}` → 201; tạo con với `parentGroupId` hợp lệ → 201.
- [ ] `PATCH` set `parentGroupId === id` → 400; `parentGroupId` không tồn tại trong org → 400.
- [ ] List/getById scope đúng theo `organizationId`; xoá → HARD delete (không lỗi `deletedAt`).

## Definition of Done

- [ ] PR service + module wiring; `pnpm --filter @erp/api build` pass.
- [ ] Smoke test 4 verb qua REST (kèm `Authorization` + `X-Branch-Id`).
- [ ] Source tiếng Anh (error message, log, comment).

## Tech Approach

- Generic CRUD body là `Record<string,any>` (không qua DTO/ValidationPipe) → normalize empty-string trong `beforeCreate/Update` (giống `normalizePayload` của item-crud).
- Dùng đúng hook `configureListQuery`/`transformListResults`/`getByIdRelations` của `BaseCrudService` (base-crud.service.ts:207-221) để resolve tên cha — không override `list()`.

## Dependencies

- Requires: TKT-SUP-01.
- Blocks: TKT-SUP-04.
