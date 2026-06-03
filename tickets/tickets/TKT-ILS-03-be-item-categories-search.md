# TKT-ILS-03 BE: Inventory-item-categories search endpoint (#1, AdminSearch module)

## Epic

[EPIC-03062026 Inventory list server-side CQRS search](../epics/EPIC-03062026-inventory-list-cqrs-search.md)

## Summary

Add a CQRS v2 search endpoint for the Nhóm hàng hoá admin list (`/admin/inventory-item-categories`, today served by the generic CRUD platform). This is the simplest of the three — no joins, no computed total, `ORGANIZATION`-scoped, 3 filterable columns matching the screenshot: `code` (Mã nhóm hàng hóa), `name` (Tên danh mục), `createdAt` (Ngày tạo). It is appended to the existing `AdminSearchV2Controller` alongside the 5 ACS endpoints.

`POST /v2/inventory-item-categories/search` → `{ data: ItemCategoryEntity[], total, page, limit }` (full entity, so the 3 visible columns + everything else render identically to the CRUD `/records` rows).

## Deliverables

- `apps/api/src/modules/admin-search/dto/item-category-search-v2.dto.ts` — `ItemCategorySearchV2Dto`.
- `apps/api/src/modules/admin-search/queries/search-item-categories-v2.query.ts` — `SearchItemCategoriesV2Query(dto, actor)`.
- `apps/api/src/modules/admin-search/queries/search-item-categories-v2.handler.ts` — `@QueryHandler` (injects `@InjectRepository(ItemCategoryEntity)`).
- `apps/api/src/modules/admin-search/controllers/admin-search-v2.controller.ts` — **append** `@Post('inventory-item-categories/search')` (`@RequirePermission('inventory.read')`).
- `apps/api/src/modules/admin-search/admin-search.module.ts` — add `ItemCategoryEntity` to `TypeOrmModule.forFeature([...])` + `SearchItemCategoriesV2Handler` to `providers`.
- `apps/api/src/modules/admin-search/queries/search-item-categories-v2.handler.spec.ts`.

## Acceptance Criteria

- [ ] Base query: `category.organizationId = actor.organizationId`. **No `branchId` scope** (entity is `ScopingPolicy.ORGANIZATION`).
- [ ] Filters via `FilterBuilder`: `code`, `name` (String); `createdAt` (DateRange, `to` day-inclusive).
- [ ] Returns the **full `ItemCategoryEntity`** (incl. `id`, `code`, `name`, `parentGroupId`, `description`, `createdAt`, `updatedAt`, `organizationId`) — no flattening; the 3 displayed columns read `code`/`name`/`createdAt`.
- [ ] Sorted `category.createdAt DESC`; paginated; returns `{ data, total, page, limit }`.
- [ ] `GET /admin/entities/inventory-item-categories/records` + `InventoryItemCategoryCrudService` unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `search-item-categories-v2.handler.spec.ts` covers: org scoping (two orgs, no leakage), each filter operator, `createdAt` range, pagination, envelope.
- [ ] No schema change; `synchronize` stays false. OpenAPI regen deferred to TKT-ILS-04.
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
// item-category-search-v2.dto.ts
export class ItemCategorySearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    code?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    name?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) createdAt?: DateRangeFilterDto;
}
```

```ts
// search-item-categories-v2.handler.ts
const page = dto.page ?? 1, limit = dto.limit ?? 20;
const qb = this.repo.createQueryBuilder('category')
  .where('category.organizationId = :orgId', { orgId: actor.organizationId });

new FilterBuilder(qb)
  .applyString('category.code', dto.code)
  .applyString('category.name', dto.name)
  .applyDateRange('category.createdAt', dto.createdAt);

qb.orderBy('category.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
const [data, total] = await qb.getManyAndCount();
return { data, total, page, limit };
```

> `ItemCategoryEntity` lives at `apps/api/src/modules/inventory/location/item-category.entity.ts` (table `inventory_item_categories`). No relation join needed. The FE registry entry that activates this endpoint is TKT-ILS-07.

## Testing Strategy

- Unit (`search-item-categories-v2.handler.spec.ts`): mocked QueryBuilder (chainable + `getManyAndCount`); assert org scope, each `FilterBuilder` call, pagination math, envelope. Same structure as `search-providers-v2.handler.spec.ts` minus the join/flatten.

## Dependencies

- Depends on: EPIC ACS phase-1 (the `AdminSearchModule` + `AdminSearchV2Controller` already exist).
- Blocks: TKT-ILS-04 (OpenAPI regen), TKT-ILS-07 (FE registry entry).
