# TKT-ACS-04 BE: Account (COA) search endpoint (#4)

## Epic

[EPIC-03062026 Backoffice admin list server-side CQRS search](../epics/EPIC-03062026-admin-list-cqrs-search.md)

## Summary

Add a CQRS search endpoint for the `accounts` (chart-of-accounts) admin list. Per-column operators on `code`/`name` + `type` + `isActive` + `createdAt`, plus an optional exact `parentAccountId` filter. Returns the full `AccountEntity` per row — including the **raw `parentAccountId` UUID** (today the parent name is resolved client-side via `LookupField`; **no join** is added, to keep parity).

`POST /v2/accounts/search` → `{ data: AccountEntity[], total, page, limit }`.

## Deliverables

- `apps/api/src/modules/admin-search/dto/account-search-v2.dto.ts` — `AccountSearchV2Dto`.
- `apps/api/src/modules/admin-search/queries/search-accounts-v2.query.ts` — `SearchAccountsV2Query(dto, actor)`.
- `apps/api/src/modules/admin-search/queries/search-accounts-v2.handler.ts` — `@QueryHandler` (injects `@InjectRepository(AccountEntity)`).
- `apps/api/src/modules/admin-search/controllers/admin-search-v2.controller.ts` — **append** `@Post('accounts/search')` (`@RequirePermission('accounting.journal.post')`).
- `apps/api/src/modules/admin-search/admin-search.module.ts` — add `AccountEntity` to `forFeature` + `SearchAccountsV2Handler` to `providers`.

## Acceptance Criteria

- [ ] Base query: `acc.organizationId = actor.organizationId`. No `branchId` scope.
- [ ] Filters via `FilterBuilder`: `code`, `name` (String); `type` (Enum: ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE); `createdAt` (DateRange). Boolean `isActive` applied directly. Optional exact `parentAccountId` (`@IsUUID`).
- [ ] Each row is the full `AccountEntity` incl. **raw `parentAccountId`** (UUID string, not a resolved name — parity with today). **No** parent-account join.
- [ ] Sorted `acc.createdAt DESC`; paginated; returns `{ data, total, page, limit }`.
- [ ] Permission key matches the current config (`accounting.journal.post` is used for read today).
- [ ] No cross-tenant leakage; `GET /admin/entities/accounts/records` unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `search-accounts-v2.handler.spec.ts` covers: org scoping, each filter operator, `type`/`isActive`/`parentAccountId` filters, pagination, raw `parentAccountId` returned.
- [ ] No schema change; `synchronize` stays false.
- [ ] OpenAPI regen deferred to TKT-ACS-06.
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
// account-search-v2.dto.ts
export class AccountSearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    code?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    name?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => EnumFilterDto)      type?: EnumFilterDto;
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) createdAt?: DateRangeFilterDto;
  @IsOptional() @IsBoolean()                                      isActive?: boolean;
  @IsOptional() @IsUUID()                                         parentAccountId?: string;
}
```

```ts
// search-accounts-v2.handler.ts
const page = dto.page ?? 1, limit = dto.limit ?? 20;
const qb = this.repo.createQueryBuilder('acc')
  .where('acc.organizationId = :orgId', { orgId: actor.organizationId });

new FilterBuilder(qb)
  .applyString('acc.code', dto.code)
  .applyString('acc.name', dto.name)
  .applyEnum('acc.type',   dto.type?.value)
  .applyDateRange('acc.createdAt', dto.createdAt);

if (dto.isActive !== undefined) qb.andWhere('acc.isActive = :ia', { ia: dto.isActive });
if (dto.parentAccountId)        qb.andWhere('acc.parentAccountId = :p', { p: dto.parentAccountId });

qb.orderBy('acc.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
const [data, total] = await qb.getManyAndCount();
return { data, total, page, limit };
```

> Deliberately **no** self-join on `parentAccountId`. Today's `/records` returns the raw UUID and the FE `LookupField` resolves the parent name from a separately-fetched account list — adding a join here would change the response shape (`không được khác`).

## Testing Strategy

- Unit (`search-accounts-v2.handler.spec.ts`): seed a parent/child hierarchy across two orgs and all `type` values; assert org scoping, each filter, `parentAccountId` filter, pagination, and that returned rows carry the raw `parentAccountId` (no nested parent object).

## Dependencies

- Depends on: TKT-ACS-01 (the `AdminSearchModule` + `AdminSearchV2Controller` must exist). Reuses `FilterBuilder`, filter sub-DTOs.
- Blocks: TKT-ACS-06 (OpenAPI regen).
