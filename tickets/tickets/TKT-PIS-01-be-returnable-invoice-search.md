# TKT-PIS-01 BE: Returnable-invoice search endpoint (#5)

## Epic

[EPIC-03062026 POS server-side invoice search](../epics/EPIC-03062026-pos-invoice-search.md)

## Summary

Add a dedicated CQRS search endpoint that powers the "Đổi trả nhanh" list (#5): finalized **paid sales** for the active branch, with the filter columns shown in the mockup (Số hóa đơn, Ngày tạo, Khách hàng, Số điện thoại, Tổng thanh toán, Chi nhánh). Follows the `cqrs-search-endpoint` skill; leaves `POST /v2/invoices/search` untouched.

`POST /v2/invoices/returnable/search` → `{ data, total, page, limit }`, each row carrying inline `customerName`, `customerPhone`, `branchName`, `totalPaid`.

## Deliverables

- `apps/api/src/modules/pos/dto/returnable-invoice-search-v2.dto.ts` — `ReturnableInvoiceSearchV2Dto`.
- `apps/api/src/modules/pos/queries/search-returnable-invoices-v2.query.ts` — `SearchReturnableInvoicesV2Query(dto, actor)`.
- `apps/api/src/modules/pos/queries/search-returnable-invoices-v2.handler.ts` — `@QueryHandler`.
- `apps/api/src/modules/pos/controllers/returnable-invoice-v2.controller.ts` — `@Version('2')`, `@RequirePermission('pos.invoice.read')`.
- `apps/api/src/modules/pos/pos.module.ts` — register the new controller + handler.

## Acceptance Criteria

- [ ] Base query: `inv.organizationId = actor.organizationId` **AND** `inv.branchId = actor.branchId` (when present) **AND** `inv.type = 'SALE'` **AND** `inv.status = 'paid'` **AND** `inv.isDraft = false`.
- [ ] `leftJoin` customer (on `id` + `organizationId`) and branch (on `inv.branchId = branch.id`); each row inlines `customerName`, `customerPhone`, `branchName`, `totalPaid` (do **not** return a root `{[id]: …}` map).
- [ ] Filters applied via `FilterBuilder`: `code` (String), `createdAt` (DateRange), `customer.name` ← `customerName` (String), `customer.phone` ← `customerPhone` (String), `inv.totalPaid` ← `totalPaid` (Compare), `branch.name` ← `branchName` (String).
- [ ] Sorted `inv.createdAt DESC`; paginated (`page` default 1, `limit` default 20, max 100); returns `{ data, total, page, limit }`.
- [ ] No cross-tenant leakage; the existing `POST /v2/invoices/search` is byte-for-byte unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `search-returnable-invoices-v2.handler.spec.ts` covers: org+branch scoping, SALE+PAID gate (DEBT/DRAFT/RETURN excluded), each filter operator, pagination, inline `branchName`/`totalPaid`.
- [ ] No schema change; `synchronize` stays false.
- [ ] `pnpm openapi:generate` run; `openapi.snapshot.json` + generated `schema.ts` committed (snapshot hygiene — pos-web does not consume it).
- [ ] No Vietnamese in backend source.

## Tech Approach

DTO (operators come from `common/filters/filter.dto.ts`):

```ts
export class ReturnableInvoiceSearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)  code?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) createdAt?: DateRangeFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)  customerName?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)  customerPhone?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => CompareFilterDto) totalPaid?: CompareFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)  branchName?: StringFilterDto;
}
```

Handler (mirror `search-invoices-v2.handler.ts`; add branch join + inline select):

```ts
const qb = this.repo
  .createQueryBuilder('inv')
  .leftJoin(CustomerEntity, 'customer',
    'customer.id = inv.customerId AND customer.organizationId = inv.organizationId')
  .leftJoin(BranchEntity, 'branch', 'branch.id = inv.branchId')
  .select(['inv'])
  .addSelect(['customer.name', 'customer.phone', 'branch.name'])
  .where('inv.organizationId = :orgId', { orgId: actor.organizationId })
  .andWhere('inv.type = :type', { type: InvoiceType.SALE })
  .andWhere('inv.status = :status', { status: InvoiceStatus.PAID })
  .andWhere('inv.isDraft = false');

if (actor.branchId) qb.andWhere('inv.branchId = :branchId', { branchId: actor.branchId });

new FilterBuilder(qb)
  .applyString('inv.code',       dto.code)
  .applyDateRange('inv.createdAt', dto.createdAt)
  .applyString('customer.name',  dto.customerName)
  .applyString('customer.phone', dto.customerPhone)
  .applyCompare('inv.totalPaid', dto.totalPaid)
  .applyString('branch.name',    dto.branchName);

qb.orderBy('inv.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
```

> Because `.leftJoin` + `.addSelect('customer.name', …)` (not `leftJoinAndSelect` of the whole relation), use `getRawAndEntities()` and merge the raw `customer_name`/`branch_name`/`customer_phone` onto each entity row, OR switch the joins to `leftJoinAndMapOne`/`addSelect` raw — pick one and inline the values per row. `branchId` is on `BaseEntity`; `BranchEntity` lives at `modules/branch/branch.entity.ts` and is globally registered (no `forFeature` needed just to join).

## Testing Strategy

- Unit (`search-returnable-invoices-v2.handler.spec.ts`): seed SALE/PAID, SALE/DEBT, DRAFT, RETURN, two branches, two orgs; assert only SALE+PAID of the actor's org+branch return; assert each filter; assert inline `branchName`/`totalPaid`.

## Dependencies

- Depends on: none (BE root). Reuses `FilterBuilder`, filter sub-DTOs, `CqrsModule` (already in `pos.module.ts`).
- Blocks: TKT-PIS-04 (FE data layer), TKT-PIS-05 (FE #5).
