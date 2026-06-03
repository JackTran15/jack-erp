# TKT-ACS-02 BE: Inventory-provider search endpoint (#2, preserve `groupName`)

## Epic

[EPIC-03062026 Backoffice admin list server-side CQRS search](../epics/EPIC-03062026-admin-list-cqrs-search.md)

## Summary

Add a CQRS search endpoint for the `inventory-providers` admin list. The single non-trivial detail: this is the **one entity that flattens a relation today** — `InventoryProviderCrudService` `leftJoinAndSelect`s `group` and `transformListResults()` maps `group.name → groupName`, returning a scalar `groupName` and **not** the nested `group` object. The handler must reproduce that exactly.

`POST /v2/inventory-providers/search` → `{ data: (ProviderEntity & { groupName }) [], total, page, limit }`.

## Deliverables

- `apps/api/src/modules/admin-search/dto/provider-search-v2.dto.ts` — `ProviderSearchV2Dto`.
- `apps/api/src/modules/admin-search/queries/search-providers-v2.query.ts` — `SearchProvidersV2Query(dto, actor)`.
- `apps/api/src/modules/admin-search/queries/search-providers-v2.handler.ts` — `@QueryHandler` (injects `@InjectRepository(ProviderEntity)`).
- `apps/api/src/modules/admin-search/controllers/admin-search-v2.controller.ts` — **append** `@Post('inventory-providers/search')` (`@RequirePermission('inventory.read')`).
- `apps/api/src/modules/admin-search/admin-search.module.ts` — add `ProviderEntity` to `forFeature` + `SearchProvidersV2Handler` to `providers`.

## Acceptance Criteria

- [ ] Base query: `provider.organizationId = actor.organizationId`. No `branchId` scope.
- [ ] `leftJoinAndSelect('provider.group', 'group')` so each row can flatten `group.name`.
- [ ] Filters via `FilterBuilder`: `code`, `name`, `email`, `phone`, `taxCode` (String); `type` (Enum); `createdAt` (DateRange). Booleans `isActive`, `isCustomer` applied directly (`qb.andWhere('provider.isActive = :x', …)`). Optional exact `groupId` (`@IsUUID`).
- [ ] **Row shape parity:** strip the nested `group` and add `groupName: group?.name ?? ''`, identical to `transformListResults()`. All other `ProviderEntity` columns preserved.
- [ ] Sorted `provider.createdAt DESC`; paginated; returns `{ data, total, page, limit }`.
- [ ] No cross-tenant leakage; `GET /admin/entities/inventory-providers/records` unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `search-providers-v2.handler.spec.ts` covers: org scoping, each filter operator, boolean filters, `groupId` filter, pagination, and **`groupName` flattened with the `group` object absent**.
- [ ] No schema change; `synchronize` stays false.
- [ ] OpenAPI regen deferred to TKT-ACS-06.
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
// provider-search-v2.dto.ts
export class ProviderSearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    code?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    name?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    email?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    phone?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    taxCode?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => EnumFilterDto)      type?: EnumFilterDto;
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) createdAt?: DateRangeFilterDto;
  @IsOptional() @IsBoolean()                                      isActive?: boolean;
  @IsOptional() @IsBoolean()                                      isCustomer?: boolean;
  @IsOptional() @IsUUID()                                         groupId?: string;
}
```

```ts
// search-providers-v2.handler.ts
const page = dto.page ?? 1, limit = dto.limit ?? 20;
const qb = this.repo.createQueryBuilder('provider')
  .leftJoinAndSelect('provider.group', 'group')
  .where('provider.organizationId = :orgId', { orgId: actor.organizationId });

new FilterBuilder(qb)
  .applyString('provider.code',    dto.code)
  .applyString('provider.name',    dto.name)
  .applyString('provider.email',   dto.email)
  .applyString('provider.phone',   dto.phone)
  .applyString('provider.taxCode', dto.taxCode)
  .applyEnum('provider.type',      dto.type?.value)
  .applyDateRange('provider.createdAt', dto.createdAt);

if (dto.isActive   !== undefined) qb.andWhere('provider.isActive   = :ia', { ia: dto.isActive });
if (dto.isCustomer !== undefined) qb.andWhere('provider.isCustomer = :ic', { ic: dto.isCustomer });
if (dto.groupId)                  qb.andWhere('provider.groupId    = :g',  { g:  dto.groupId });

qb.orderBy('provider.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
const [rows, total] = await qb.getManyAndCount();

// Mirror InventoryProviderCrudService.transformListResults() exactly.
const data = rows.map((row) => {
  const { group, ...rest } = row as any;
  return { ...rest, groupName: group?.name ?? '' };
});
return { data, total, page, limit };
```

> `provider.group` is a `@ManyToOne` already declared on `ProviderEntity`, so `leftJoinAndSelect` needs no extra `forFeature` registration. Keep the `groupName` fallback `''` (not `null`) to match the current scalar.

## Testing Strategy

- Unit (`search-providers-v2.handler.spec.ts`): seed providers with/without a group across two orgs and both `type`/`isActive`/`isCustomer` values; assert org scoping, each filter, and that every returned row has `groupName` (string, `''` when no group) and **no** `group` key.

## Dependencies

- Depends on: TKT-ACS-01 (the `AdminSearchModule` + `AdminSearchV2Controller` must exist). Reuses `FilterBuilder`, filter sub-DTOs; mirrors `transformListResults()`.
- Blocks: TKT-ACS-06 (OpenAPI regen).
