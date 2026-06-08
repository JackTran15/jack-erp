# TKT-IIS-02 BE: CQRS grouped search endpoint (DTO + Query + Handler + Controller + wiring)

## Epic

[EPIC-03062026 Inventory item server-side grouped search (v2)](../epics/EPIC-03062026-inventory-item-search-v2.md)

## Summary

Dựng bộ CQRS đầy đủ cho `POST /v2/inventory-items/search` theo skill `cqrs-search-endpoint`: request DTO (`search` toàn cục + 6 filter của trang), Query carrier, `@QueryHandler` (map DTO → gọi `listProductGroups` đã mở rộng ở TKT-IIS-01), `@Version('2')` controller dispatch qua `QueryBus`, và wire `CqrsModule` + handler + controller vào `InventoryLocationModule`. Trả **đúng** envelope `{ data, total, page, pageSize }` với row `ProductGroupRow`.

## Deliverables

- `apps/api/src/modules/inventory/location/dto/inventory-item-search-v2.dto.ts` — `InventoryItemSearchV2Dto`: `page`, `pageSize` (`@Min(1)`/`@Max(100)`, default 1/20 — **dùng `pageSize`, không phải `limit`**), `search?: string`, `isActive?: EnumFilterDto`, `isPosVisible?: EnumFilterDto`, `categoryId?: @IsUUID`, `productId?: @IsUUID`, `brand?: StringFilterDto`, `itemType?: StringFilterDto`. Khai báo **đủ mọi field** (global `whitelist`/`forbidNonWhitelisted`).
- `apps/api/src/modules/inventory/location/queries/search-inventory-items-v2.query.ts` — `SearchInventoryItemsV2Query { dto, actor }`.
- `apps/api/src/modules/inventory/location/queries/search-inventory-items-v2.handler.ts` — `@QueryHandler` inject `InventoryItemCrudService`; map DTO → `ProductGroupsQueryDto` (parse `isActive/isPosVisible` `'true'→true`, lấy `brand.value`/`itemType.value`); gọi `listProductGroups(actor, query)`; trả `{ data, total, page, pageSize }`.
- `apps/api/src/modules/inventory/location/controllers/inventory-item-v2.controller.ts` — `@Controller('inventory-items')` + `@Post('search')` + `@Version('2')` + `@Actor()` + `@RequirePermission('inventory.read')`; dispatch `queryBus.execute(new SearchInventoryItemsV2Query(dto, actor))`. Thêm `@ApiOkResponse` mô tả envelope grouped để OpenAPI sinh type.
- `apps/api/src/modules/inventory/location/inventory-location.module.ts` — thêm `CqrsModule` vào `imports`, `SearchInventoryItemsV2Handler` vào `providers`, `InventoryItemV2Controller` vào `controllers`.

## Acceptance Criteria

- [ ] `POST /v2/inventory-items/search` reachable tại `/v2/...` (URI versioning đã bật global ở `main.ts` — không sửa bootstrap).
- [ ] Handler scope `actor.organizationId` (qua `listProductGroups`); **không** branch-scope; không rò chéo tenant.
- [ ] Không filter → trả y hệt `GET /admin/entities/inventory-items/records` cùng org/page/pageSize (row/thứ tự/giá trị/total trùng khớp).
- [ ] Envelope **chính xác** `{ data, total, page, pageSize }`; `page`/`pageSize` lấy từ DTO (default 1/20), bounded `@Min/@Max`.
- [ ] Map filter đúng: `isActive`/`isPosVisible` `EnumFilterDto.value` `'true'/'false'` → boolean (giá trị khác/null → bỏ qua); `brand`/`itemType` lấy `StringFilterDto.value` (rỗng → bỏ qua); `categoryId`/`productId` truyền thẳng UUID.
- [ ] DTO pass `whitelist`/`forbidNonWhitelisted` (gửi field lạ → 400).
- [ ] Guard khớp sibling: `@RequirePermission('inventory.read')`; xác nhận `AuthGuard` áp ở đâu (global APP_GUARD vs class-level) cho `modules/inventory/location` và match — không để endpoint hở auth.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh; app **boot được** (handler đã đăng ký `providers`, `CqrsModule` đã `imports`, controller đã `controllers`).
- [ ] `search-inventory-items-v2.handler.spec.ts` phủ: scope org, no-filter parity (so với `listProductGroups`), map từng filter (active/posVisible/brand/itemType/categoryId/productId), envelope dùng `pageSize`.
- [ ] Không schema change; `synchronize` false.
- [ ] Backend source tiếng Anh (comment/Swagger/error/log).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

DTO:

```ts
import { IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EnumFilterDto, StringFilterDto } from '../../../../common/filters/filter.dto';

export class InventoryItemSearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number = 20;

  /** Global search: code / name / category.name (product: p.code/p.name/ic.name). */
  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @ValidateNested() @Type(() => EnumFilterDto) isActive?: EnumFilterDto;
  @IsOptional() @ValidateNested() @Type(() => EnumFilterDto) isPosVisible?: EnumFilterDto;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto) brand?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto) itemType?: StringFilterDto;
}
```

Handler (Hướng A — delegate, thin):

```ts
@QueryHandler(SearchInventoryItemsV2Query)
export class SearchInventoryItemsV2Handler implements IQueryHandler<SearchInventoryItemsV2Query> {
  constructor(private readonly itemCrud: InventoryItemCrudService) {}

  async execute({ dto, actor }: SearchInventoryItemsV2Query) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const toBool = (v?: string | null) => (v === 'true' ? true : v === 'false' ? false : undefined);

    const { data, total } = await this.itemCrud.listProductGroups(actor, {
      page, pageSize,
      search: dto.search,
      categoryId: dto.categoryId,
      productId: dto.productId,
      isActive: toBool(dto.isActive?.value),
      isPosVisible: toBool(dto.isPosVisible?.value),
      brand: dto.brand?.value,
      itemType: dto.itemType?.value,
    });
    return { data, total, page, pageSize };
  }
}
```

Controller — mirror `invoice-v2.controller.ts` (paths: `../../../../common/...`, `../../../auth/decorators`, `../../../rbac/permission.guard` — chỉnh theo độ sâu thư mục `location/controllers/`):

```ts
@Controller('inventory-items')
@UseGuards(PermissionGuard)
export class InventoryItemV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.read')
  search(@Body() dto: InventoryItemSearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchInventoryItemsV2Query(dto, actor));
  }
}
```

Module: `imports: [..., CqrsModule]`, `controllers: [..., InventoryItemV2Controller]`, `providers: [..., SearchInventoryItemsV2Handler]`. `InventoryItemCrudService` đã là provider sẵn → inject được vào handler.

> Nếu Step 3 chốt **Hướng B**: bỏ phần delegate; handler tự dựng QueryBuilder + `FilterBuilder` + gom nhóm in-memory (xem TKT-IIS-01 Tech Approach), cần thêm `@InjectRepository(ItemEntity)` và import join entities sẵn có trong `forFeature`.

## Testing Strategy

- Unit (`search-inventory-items-v2.handler.spec.ts`): mock/seed qua `InventoryItemCrudService`; assert scope org, parity no-filter, map từng filter, envelope `{data,total,page,pageSize}`.
- E2E thực (search round-trip) thuộc TKT-IIS-03.

## Dependencies

- Depends on: [TKT-IIS-01](./TKT-IIS-01-be-extend-product-group-filters.md).
- Blocks: [TKT-IIS-03](./TKT-IIS-03-be-openapi-and-tests.md).
