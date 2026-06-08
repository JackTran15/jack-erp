# TKT-ILS-02 BE: Goods-issue search endpoint (#3, polymorphic party + `totalAmount`)

## Epic

[EPIC-03062026 Inventory list server-side CQRS search](../epics/EPIC-03062026-inventory-list-cqrs-search.md)

## Summary

Add a CQRS v2 search endpoint for the Xuất kho list (`GoodsIssuePage`, today `GET /inventory/goods-issues`). Like goods-receipt it computes `totalAmount` in SQL. Two extra wrinkles: **Đối tượng (party) is polymorphic** — the FE cell cascades `provider.name → targetBranch.name → customerName` — so the party filter matches a `COALESCE(...)` of those; and the **Ngày** column uses `issueDate` (fall back to `createdAt`), so the date filter targets whichever column the current list returns.

`POST /v2/inventory/goods-issues/search` → `{ data: (GoodsIssueEntity & { totalAmount }) [], total, page, limit }`, with nested `provider` + `targetBranch` preserved.

## Deliverables

- `apps/api/src/modules/inventory/goods-issue/dto/goods-issue-search-v2.dto.ts` — `GoodsIssueSearchV2Dto`.
- `apps/api/src/modules/inventory/goods-issue/queries/search-goods-issues-v2.query.ts` — `SearchGoodsIssuesV2Query(dto, actor)`.
- `apps/api/src/modules/inventory/goods-issue/queries/search-goods-issues-v2.handler.ts` — `@QueryHandler` (injects `@InjectRepository(GoodsIssueEntity)`).
- `apps/api/src/modules/inventory/goods-issue/controllers/goods-issue-v2.controller.ts` — new `@Controller('inventory/goods-issues')` `@Version('2')`, class-level guards, `@Post('search')`, `@RequirePermission(<same key as GET /inventory/goods-issues>)`, `@Actor()`, injects `QueryBus`.
- `apps/api/src/modules/inventory/goods-issue/goods-issue.module.ts` — import `CqrsModule`, register handler + controller.
- `apps/api/src/modules/inventory/goods-issue/queries/search-goods-issues-v2.handler.spec.ts`.

## Acceptance Criteria

- [ ] Base query scopes by `actor.organizationId` + `actor.branchId` **exactly as the current `GoodsIssueService.list()` does**, including its default behavior of hiding `CANCELLED` unless a status is requested (confirm and mirror — `không được trả khác` the current list).
- [ ] `leftJoinAndSelect('gi.provider', 'provider')` and join the target branch so each row keeps nested `provider { id, code, name }` + `targetBranch { id, name }` + `customerName` (party cell cascade renders identically).
- [ ] `totalAmount` = correlated subquery `COALESCE(SUM(l.quantity * l.unit_price), 0)` over `goods_issue_lines` (verify FK column), returned per row.
- [ ] Filters via `FilterBuilder`: `documentNumber`, `party` (→ `COALESCE(provider.name, <targetBranch>.name, gi.customerName)`), `notes`, `reason` (String); `purpose` (Enum); `date` (→ the date column the Ngày column uses; verify `issue_date` vs `created_at`); `totalAmount` (Compare).
- [ ] Returned row = full `GoodsIssueEntity` (incl. `documentNumber`, date, `notes`, `reason`, `purpose`, `status`, `provider`, `providerId`, `targetBranch`, `customerName`) **plus** `totalAmount`.
- [ ] Sorted by that date column DESC; paginated; returns `{ data, total, page, limit }`.
- [ ] `GET /inventory/goods-issues` and `GoodsIssueService` unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `search-goods-issues-v2.handler.spec.ts` covers: org+branch scoping + the CANCELLED-hidden default, the polymorphic party filter, `totalAmount` subquery + compare, preserved nested `provider`/`targetBranch`, pagination, envelope.
- [ ] No schema change; `synchronize` stays false. OpenAPI regen deferred to TKT-ILS-04.
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
// goods-issue-search-v2.dto.ts — same shape as goods-receipt's, but `notes` instead of `description`.
export class GoodsIssueSearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    documentNumber?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    party?: StringFilterDto;       // COALESCE(provider/branch/customer)
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    notes?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    reason?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => EnumFilterDto)      purpose?: EnumFilterDto;
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) date?: DateRangeFilterDto;
  @IsOptional() @ValidateNested() @Type(() => CompareFilterDto)   totalAmount?: CompareFilterDto;
}
```

```ts
// search-goods-issues-v2.handler.ts (skeleton)
const totalSub =
  `(SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)
    FROM goods_issue_lines l WHERE l.goods_issue_id = gi.id)`;
const partyExpr = `COALESCE(provider.name, target_branch.name, gi.customer_name)`;

const qb = this.repo.createQueryBuilder('gi')
  .leftJoinAndSelect('gi.provider', 'provider')
  .leftJoinAndSelect('gi.targetBranch', 'target_branch') // or leftJoin branches on gi.target_branch_id (verify relation + id type/cast)
  .addSelect(totalSub, 'gi_total_amount')
  .where('gi.organizationId = :orgId', { orgId: actor.organizationId });
if (actor.branchId) qb.andWhere('gi.branchId = :br', { br: actor.branchId });
// + replicate the current list's "hide CANCELLED unless requested" default

new FilterBuilder(qb)
  .applyString('gi.documentNumber', dto.documentNumber)
  .applyString(partyExpr,           dto.party)
  .applyString('gi.notes',          dto.notes)
  .applyString('gi.reason',         dto.reason)
  .applyEnum('gi.purpose',          dto.purpose?.value)
  .applyDateRange('gi.<dateCol>',   dto.date)
  .applyCompare(totalSub,           dto.totalAmount);

qb.orderBy('gi.<dateCol>', 'DESC').skip((page - 1) * limit).take(limit);
const total = await qb.clone().getCount();
const { entities, raw } = await qb.getRawAndEntities();
const data = entities.map((e, i) => ({ ...e, totalAmount: Number(raw[i]?.gi_total_amount ?? 0) }));
return { data, total, page, limit };
```

> Verify before coding (do not assume): (1) the actual Ngày source column — `goods_issues.issue_date` vs inherited `created_at`; (2) whether a `targetBranch` relation is declared or you must `leftJoin branches` on `target_branch_id` (watch the `branch_id` varchar→uuid `::cast` gotcha noted for invoices); (3) the line table FK column; (4) the current `list()` CANCELLED-hidden default.

## Testing Strategy

- Unit (`search-goods-issues-v2.handler.spec.ts`): mocked QueryBuilder; assert org+branch scope + CANCELLED default, the `COALESCE` party filter, `totalAmount` subquery + compare, preserved `provider`/`targetBranch`, pagination, envelope.

## Dependencies

- Depends on: EPIC ACS phase-1 (shared filter DTOs + `FilterBuilder`); the `inventory-item-v2.controller.ts` precedent.
- Blocks: TKT-ILS-04 (OpenAPI regen), TKT-ILS-06 (FE Xuất kho).
