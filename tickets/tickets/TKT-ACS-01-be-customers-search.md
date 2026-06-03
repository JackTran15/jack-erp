# TKT-ACS-01 BE: AdminSearch scaffold + Customer search (#1)

## Epic

[EPIC-03062026 Backoffice admin list server-side CQRS search](../epics/EPIC-03062026-admin-list-cqrs-search.md)

## Summary

Create the shared `AdminSearchModule` + the single `AdminSearchV2Controller` that hosts **all five** search routes, and land the first vertical slice — `customers`. Replaces the generic CRUD single-search-box + status/branch filters with per-column operators querying the whole org dataset. Returns the **full `CustomerEntity`** per row (no field dropped) under `{ data, total, page, limit }`. Follows the `cqrs-search-endpoint` skill (one controller variant); leaves `GET /admin/entities/customers/records` untouched.

`POST /v2/customers/search` → `{ data: CustomerEntity[], total, page, limit }`.

## Deliverables

**Shared scaffold (created here, extended by TKT-ACS-02…05):**

- `apps/api/src/modules/admin-search/admin-search.module.ts` — new module. `imports: [CqrsModule, TypeOrmModule.forFeature([CustomerEntity, …added per ticket]), RbacModule]`; `controllers: [AdminSearchV2Controller]`; `providers: [SearchCustomersV2Handler, …added per ticket]`.
- `apps/api/src/modules/admin-search/controllers/admin-search-v2.controller.ts` — `AdminSearchV2Controller`: `@Controller()`, `@Version('2')` + class-level `@UseGuards(PermissionGuard)` (mirror `UsersController`/`InvoiceV2Controller`; AuthGuard is the global `APP_GUARD`). One thin `@Post('<entity>/search')` method per entity, each dispatching its Query via `QueryBus`.
- `apps/api/src/app.module.ts` — register `AdminSearchModule` in `imports`.

**Customers slice:**

- `apps/api/src/modules/admin-search/dto/customer-search-v2.dto.ts` — `CustomerSearchV2Dto`.
- `apps/api/src/modules/admin-search/queries/search-customers-v2.query.ts` — `SearchCustomersV2Query(dto, actor)`.
- `apps/api/src/modules/admin-search/queries/search-customers-v2.handler.ts` — `@QueryHandler` (injects `@InjectRepository(CustomerEntity)`).
- Add the `@Post('customers/search')` route (`@RequirePermission('customer.read')`) to `AdminSearchV2Controller`.

## Acceptance Criteria

- [ ] Base query: `customer.organizationId = actor.organizationId`. **No** `branchId` scope (entity is `ORGANIZATION`-scoped); `branchId` is an optional exact *filter* only.
- [ ] Filters via `FilterBuilder`: `code`, `name`, `email`, `phone` (String); `status` (Enum); `createdAt` (DateRange). Plus optional exact `branchId` (`@IsUUID`) applied with `qb.andWhere('customer.branchId = :b', …)`.
- [ ] Each row is the **full entity** (`getManyAndCount()` over `CustomerEntity`) — `code`, `groupId`, `assignedStaffId`, `companyName`, `taxCode`, `note`, etc. all present, identical to today's `/records` rows.
- [ ] Sorted `customer.createdAt DESC`; paginated (`page` default 1, `limit` default 20, max 100); returns `{ data, total, page, limit }`.
- [ ] No cross-tenant leakage; `GET /admin/entities/customers/records` is byte-for-byte unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `search-customers-v2.handler.spec.ts` covers: org scoping (two orgs → only actor's), each filter operator, `branchId` filter, pagination, full-entity row shape.
- [ ] No schema change; `synchronize` stays false.
- [ ] OpenAPI regen deferred to TKT-ACS-06.
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
// customer-search-v2.dto.ts
export class CustomerSearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    code?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    name?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    email?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    phone?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => EnumFilterDto)      status?: EnumFilterDto;
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) createdAt?: DateRangeFilterDto;
  @IsOptional() @IsUUID()                                         branchId?: string;
}
```

```ts
// search-customers-v2.handler.ts
const page = dto.page ?? 1, limit = dto.limit ?? 20;
const qb = this.repo.createQueryBuilder('customer')
  .where('customer.organizationId = :orgId', { orgId: actor.organizationId });

new FilterBuilder(qb)
  .applyString('customer.code',  dto.code)
  .applyString('customer.name',  dto.name)
  .applyString('customer.email', dto.email)
  .applyString('customer.phone', dto.phone)
  .applyEnum('customer.status',  dto.status?.value)
  .applyDateRange('customer.createdAt', dto.createdAt);

if (dto.branchId) qb.andWhere('customer.branchId = :b', { b: dto.branchId });

qb.orderBy('customer.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
const [data, total] = await qb.getManyAndCount();
return { data, total, page, limit };
```

> No join needed — customers render no combined/FK display field today. Returning the whole entity guarantees `không trả thiếu`.

Shared controller (each later ticket appends one more `@Post`):

```ts
// admin-search-v2.controller.ts
@Controller()
@Version('2')
@UseGuards(PermissionGuard)
export class AdminSearchV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('customers/search')
  @RequirePermission('customer.read')
  searchCustomers(@Body() dto: CustomerSearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchCustomersV2Query(dto, actor));
  }
  // TKT-ACS-02 → inventory-providers/search ; -03 → job-positions/search ;
  // -04 → accounts/search ; -05 → employees/search
}
```

> Empty `@Controller()` prefix + method-level full paths resolve to `POST /v2/<entity>/search` under the class-level `@Version('2')`. `@RequirePermission` is per-method so each route keeps its own permission key.

## Testing Strategy

- Unit (`search-customers-v2.handler.spec.ts`): seed two orgs, customers with varied code/name/status/branch/createdAt; assert only actor-org rows return, each filter operator narrows correctly, `branchId` filter, pagination math, and that a returned row carries the full column set.

## Dependencies

- Depends on: none (BE root). Reuses `FilterBuilder`, filter sub-DTOs, `CqrsModule`.
- Blocks: TKT-ACS-02, -03, -04, -05 (they append routes/handlers to this module + controller) and TKT-ACS-06 (OpenAPI regen).
