# TKT-ACS-03 BE: Job-position search endpoint (#3)

## Epic

[EPIC-03062026 Backoffice admin list server-side CQRS search](../epics/EPIC-03062026-admin-list-cqrs-search.md)

## Summary

Add a CQRS search endpoint for the `job-positions` admin list — the simplest of the five (no joins, no combined fields). Per-column operators on `name`/`code` + `isActive` + `createdAt`. Returns the full `JobPositionEntity` per row.

`POST /v2/job-positions/search` → `{ data: JobPositionEntity[], total, page, limit }`.

## Deliverables

- `apps/api/src/modules/admin-search/dto/job-position-search-v2.dto.ts` — `JobPositionSearchV2Dto`.
- `apps/api/src/modules/admin-search/queries/search-job-positions-v2.query.ts` — `SearchJobPositionsV2Query(dto, actor)`.
- `apps/api/src/modules/admin-search/queries/search-job-positions-v2.handler.ts` — `@QueryHandler` (injects `@InjectRepository(JobPositionEntity)`).
- `apps/api/src/modules/admin-search/controllers/admin-search-v2.controller.ts` — **append** `@Post('job-positions/search')` (`@RequirePermission('iam.user.read')`).
- `apps/api/src/modules/admin-search/admin-search.module.ts` — add `JobPositionEntity` to `forFeature` + `SearchJobPositionsV2Handler` to `providers`.

## Acceptance Criteria

- [ ] Base query: `jp.organizationId = actor.organizationId`. No `branchId` scope.
- [ ] Soft-deleted rows excluded automatically (entity has `@DeleteDateColumn`; `SelectQueryBuilder` adds `deletedAt IS NULL`) — same as the generic CRUD list. Do **not** call `.withDeleted()`.
- [ ] Filters via `FilterBuilder`: `name`, `code` (String); `createdAt` (DateRange). Boolean `isActive` applied directly.
- [ ] Each row is the full `JobPositionEntity` (`name`, `code`, `description`, `isActive`, `createdAt`, …).
- [ ] Sorted `jp.createdAt DESC`; paginated; returns `{ data, total, page, limit }`.
- [ ] No cross-tenant leakage; `GET /admin/entities/job-positions/records` unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `search-job-positions-v2.handler.spec.ts` covers: org scoping, each filter operator, `isActive` filter, soft-deleted excluded, pagination.
- [ ] No schema change; `synchronize` stays false.
- [ ] OpenAPI regen deferred to TKT-ACS-06.
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
// job-position-search-v2.dto.ts
export class JobPositionSearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    name?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    code?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) createdAt?: DateRangeFilterDto;
  @IsOptional() @IsBoolean()                                      isActive?: boolean;
}
```

```ts
// search-job-positions-v2.handler.ts
const page = dto.page ?? 1, limit = dto.limit ?? 20;
const qb = this.repo.createQueryBuilder('jp')
  .where('jp.organizationId = :orgId', { orgId: actor.organizationId });

new FilterBuilder(qb)
  .applyString('jp.name', dto.name)
  .applyString('jp.code', dto.code)
  .applyDateRange('jp.createdAt', dto.createdAt);

if (dto.isActive !== undefined) qb.andWhere('jp.isActive = :ia', { ia: dto.isActive });

qb.orderBy('jp.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
const [data, total] = await qb.getManyAndCount();
return { data, total, page, limit };
```

## Testing Strategy

- Unit (`search-job-positions-v2.handler.spec.ts`): seed positions across two orgs incl. a soft-deleted + inactive one; assert org scoping, `name`/`code` operators, `isActive` filter, soft-deleted excluded, pagination.

## Dependencies

- Depends on: TKT-ACS-01 (the `AdminSearchModule` + `AdminSearchV2Controller` must exist). Reuses `FilterBuilder`, filter sub-DTOs.
- Blocks: TKT-ACS-06 (OpenAPI regen).
