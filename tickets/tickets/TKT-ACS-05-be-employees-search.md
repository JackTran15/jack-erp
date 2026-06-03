# TKT-ACS-05 BE: Employee search endpoint (#5, preserve full `UserListItem`)

## Epic

[EPIC-03062026 Backoffice admin list server-side CQRS search](../epics/EPIC-03062026-admin-list-cqrs-search.md)

## Summary

Add a CQRS search endpoint for the `employees` admin list — the only **non-CRUD** surface. Today `EmployeesPage` calls `GET /admin/users` (`UsersService.list`), which queries `UserEntity`, batch-loads `EmployeeProfileEntity` with `relations: ["jobPosition"]`, and maps each row to a rich `UserListItem` via `UsersService.toListItem()`:

```ts
// UserListItem (shared-interfaces) — MUST be reproduced exactly
{ id, email, firstName, lastName, isActive, lastLoginAt, createdAt, updatedAt,
  code: string | null,
  profile: { code, jobPosition: { id, name } | null, photoUrl, mobile, employmentStatus } | null }
```

The CQRS handler adds **per-column operators** over the joined tables but reuses the **existing mapper** so the row shape stays byte-identical. To avoid drift, extract the current "batch-load profiles + map rows" block from `UsersService.list()` into a public `UsersService.toListItems(rows, actor)` and call it from both `list()` and the handler.

`POST /v2/employees/search` → `{ data: UserListItem[], total, page, limit }`.

## Deliverables

- `apps/api/src/modules/admin-search/dto/employee-search-v2.dto.ts` — `EmployeeSearchV2Dto`.
- `apps/api/src/modules/admin-search/queries/search-employees-v2.query.ts` — `SearchEmployeesV2Query(dto, actor)`.
- `apps/api/src/modules/admin-search/queries/search-employees-v2.handler.ts` — `@QueryHandler` (injects `@InjectRepository(UserEntity)` + `UsersService`).
- `apps/api/src/modules/admin-search/controllers/admin-search-v2.controller.ts` — **append** `@Post('employees/search')` (`@RequirePermission('iam.user.read')`).
- `apps/api/src/modules/admin-search/admin-search.module.ts` — add `UserEntity` to `forFeature` + `SearchEmployeesV2Handler` to `providers`. (`RbacModule` is already imported by the module — see below.)
- `apps/api/src/modules/rbac/users.service.ts` — extract a **public** `toListItems(rows: UserEntity[], actor: ActorContext): Promise<UserListItem[]>` (batch-load profiles `relations: ["jobPosition"]` + `toListItem` map); refactor `list()` to call it. Surgical — no behavior change to `list()`.
- `apps/api/src/modules/rbac/rbac.module.ts` — add `UsersService` to `exports` so `AdminSearchModule` can inject it. (No `CqrsModule`/controller change here — the controller lives in `AdminSearchModule`.)

## Acceptance Criteria

- [ ] Base query on `UserEntity`: `u.organizationId = actor.organizationId`. No `branchId` scope.
- [ ] `leftJoin EmployeeProfileEntity profile ON profile.userId = u.id AND profile.organizationId = u.organizationId` (for `code`/`fullName`/`jobPositionId` filters). The 1:1 join must not fan out rows.
- [ ] Filters via `FilterBuilder`: `code` → `profile.code` (String); `fullName` → `CONCAT(u.firstName, ' ', u.lastName)` (String); `email` → `u.email` (String); `createdAt` → `u.createdAt` (DateRange). Boolean `isActive` → `u.isActive` direct. Optional exact `jobPositionId` → `profile.jobPositionId`.
- [ ] **Row shape parity:** map the paginated user rows through `UsersService.toListItems()` so each row is a full `UserListItem` with `code` and the nested `profile.jobPosition {id,name}` (never dropped, never an N+1).
- [ ] Sorted `u.createdAt DESC`; paginated; returns `{ data, total, page, limit }`.
- [ ] No cross-tenant leakage; `GET /admin/users` is byte-for-byte unchanged (its envelope stays `{ data, total, page, pageSize }`).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass, incl. the existing `users.service` specs still green after the `toListItems` extraction.
- [ ] `search-employees-v2.handler.spec.ts` covers: org scoping, `code`/`fullName`/`email` operators, `isActive` + `jobPositionId` filters, pagination, and **`profile.jobPosition {id,name}` present** on a mapped row (+ `profile: null` when no profile).
- [ ] No schema change; `synchronize` stays false.
- [ ] OpenAPI regen deferred to TKT-ACS-06.
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
// employee-search-v2.dto.ts
export class EmployeeSearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    code?: StringFilterDto;     // profile.code
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    fullName?: StringFilterDto;  // CONCAT(firstName,' ',lastName)
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    email?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) createdAt?: DateRangeFilterDto;
  @IsOptional() @IsBoolean()                                      isActive?: boolean;          // "status"
  @IsOptional() @IsUUID()                                         jobPositionId?: string;
}
```

```ts
// search-employees-v2.handler.ts
const page = dto.page ?? 1, limit = dto.limit ?? 20;
const qb = this.userRepo.createQueryBuilder('u')
  .leftJoin(EmployeeProfileEntity, 'profile',
    'profile.userId = u.id AND profile.organizationId = u.organizationId')
  .where('u.organizationId = :orgId', { orgId: actor.organizationId });

new FilterBuilder(qb)
  .applyString('profile.code',                       dto.code)
  .applyString("CONCAT(u.firstName, ' ', u.lastName)", dto.fullName)
  .applyString('u.email',                            dto.email)
  .applyDateRange('u.createdAt',                     dto.createdAt);

if (dto.isActive !== undefined) qb.andWhere('u.isActive = :ia', { ia: dto.isActive });
if (dto.jobPositionId)          qb.andWhere('profile.jobPositionId = :jp', { jp: dto.jobPositionId });

qb.orderBy('u.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
const [rows, total] = await qb.getManyAndCount();      // entities only — profile re-loaded by the mapper
const data = await this.users.toListItems(rows, actor); // reuse current batch-load + toListItem
return { data, total, page, limit };
```

> `FilterBuilder.applyString` builds `<col> ILIKE :key`, so passing the `CONCAT(...)` expression as the column yields `CONCAT(u.firstName,' ',u.lastName) ILIKE :key` — valid SQL. Because the response profile data comes from `toListItems` (which batch-loads `relations: ["jobPosition"]` exactly like today), the `leftJoin profile` is used **only for filtering**, never for selecting display fields — eliminating any shape drift from the join.

## Testing Strategy

- Unit (`search-employees-v2.handler.spec.ts`): seed users with/without a profile, varied job positions, two orgs, active/inactive; assert org scoping, each operator (incl. `fullName` over the concat), `jobPositionId` filter, pagination, and that mapped rows expose `code` + `profile.jobPosition {id,name}` (and `profile: null` for the profile-less user).
- Regression: existing `users.service` specs must pass unchanged after the `toListItems` extraction.

## Dependencies

- Depends on: TKT-ACS-01 (the `AdminSearchModule` + `AdminSearchV2Controller` must exist). Reuses `FilterBuilder`, filter sub-DTOs, and the existing `UsersService` mapper.
- Blocks: TKT-ACS-06 (OpenAPI regen).
