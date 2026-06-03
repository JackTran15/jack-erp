# TKT-ILS-01 BE: Goods-receipt search endpoint (#2, computed `totalAmount`)

## Epic

[EPIC-03062026 Inventory list server-side CQRS search](../epics/EPIC-03062026-inventory-list-cqrs-search.md)

## Summary

Add a CQRS v2 search endpoint for the Nhập kho list (`PurchaseOrdersPage`, today `GET /goods-receipts`). Per-column filters over the whole org+branch dataset with server-side pagination. The non-trivial detail: **Tổng tiền is not a stored column** — it is summed from `lines` on the FE today; the handler computes it in SQL (correlated `SUM(quantity × unit_price)`), returns it as `totalAmount`, and supports filtering on it.

`POST /v2/goods-receipts/search` → `{ data: (GoodsReceiptEntity & { totalAmount }) [], total, page, limit }`, with the nested `provider` preserved.

## Deliverables

- `apps/api/src/modules/inventory/goods-receipt/dto/goods-receipt-search-v2.dto.ts` — `GoodsReceiptSearchV2Dto`.
- `apps/api/src/modules/inventory/goods-receipt/queries/search-goods-receipts-v2.query.ts` — `SearchGoodsReceiptsV2Query(dto, actor)`.
- `apps/api/src/modules/inventory/goods-receipt/queries/search-goods-receipts-v2.handler.ts` — `@QueryHandler` (injects `@InjectRepository(GoodsReceiptEntity)`).
- `apps/api/src/modules/inventory/goods-receipt/controllers/goods-receipt-v2.controller.ts` — new `@Controller('goods-receipts')` `@Version('2')`, class-level `@UseGuards(AuthGuard, PermissionGuard)`, `@Post('search')`, `@RequirePermission(<same key as GET /goods-receipts>)`, `@Actor()`, injects `QueryBus`.
- `apps/api/src/modules/inventory/goods-receipt/goods-receipt.module.ts` — import `CqrsModule`, register `SearchGoodsReceiptsV2Handler` provider + the new controller.
- `apps/api/src/modules/inventory/goods-receipt/queries/search-goods-receipts-v2.handler.spec.ts`.

## Acceptance Criteria

- [ ] Base query scopes by `actor.organizationId`, and by `actor.branchId` **exactly as the current `GoodsReceiptService.list()` does** (org always; branch when set) — confirm the current scoping and mirror it; no cross-tenant/branch leakage.
- [ ] `leftJoinAndSelect('gr.provider', 'provider')` so each row keeps the nested `provider { id, code, name }` (FE party cell reads `row.provider?.name`).
- [ ] `totalAmount` = correlated subquery `COALESCE(SUM(l.quantity * l.unit_price), 0)` over `goods_receipt_lines` (verify the FK column name, e.g. `goods_receipt_id`), returned as a numeric per row.
- [ ] Filters via `FilterBuilder`: `documentNumber`, `party` (→ `provider.name`), `description`, `reason` (String); `purpose` (Enum); `date` (→ `gr.receivedAt`, DateRange, `to` day-inclusive); `totalAmount` (Compare, applied against the same subquery expression).
- [ ] Returned row = full `GoodsReceiptEntity` (incl. `documentNumber`, `receivedAt`, `description`, `reason`, `purpose`, `status`, `provider`, `providerId`) **plus** `totalAmount`. `lines` need not be included.
- [ ] Sorted `gr.receivedAt DESC`; paginated; returns `{ data, total, page, limit }`.
- [ ] `GET /goods-receipts` and `GoodsReceiptService` unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `search-goods-receipts-v2.handler.spec.ts` covers: org+branch scoping, each filter operator, the `totalAmount` subquery value + a `totalAmount` compare filter, preserved nested `provider`, pagination, envelope.
- [ ] No schema change; `synchronize` stays false. OpenAPI regen deferred to TKT-ILS-04.
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
// goods-receipt-search-v2.dto.ts
export class GoodsReceiptSearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    documentNumber?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    party?: StringFilterDto;        // provider.name
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    description?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    reason?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => EnumFilterDto)      purpose?: EnumFilterDto;
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) date?: DateRangeFilterDto;       // receivedAt
  @IsOptional() @ValidateNested() @Type(() => CompareFilterDto)   totalAmount?: CompareFilterDto;
}
```

```ts
// search-goods-receipts-v2.handler.ts
const page = dto.page ?? 1, limit = dto.limit ?? 20;
const totalSub =
  `(SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)
    FROM goods_receipt_lines l WHERE l.goods_receipt_id = gr.id)`;

const qb = this.repo.createQueryBuilder('gr')
  .leftJoinAndSelect('gr.provider', 'provider')
  .addSelect(totalSub, 'gr_total_amount')
  .where('gr.organizationId = :orgId', { orgId: actor.organizationId });
if (actor.branchId) qb.andWhere('gr.branchId = :br', { br: actor.branchId }); // mirror current list scoping

new FilterBuilder(qb)
  .applyString('gr.documentNumber', dto.documentNumber)
  .applyString('provider.name',     dto.party)
  .applyString('gr.description',     dto.description)
  .applyString('gr.reason',          dto.reason)
  .applyEnum('gr.purpose',           dto.purpose?.value)
  .applyDateRange('gr.receivedAt',   dto.date)
  .applyCompare(totalSub,            dto.totalAmount);   // col may be an expression

qb.orderBy('gr.receivedAt', 'DESC').skip((page - 1) * limit).take(limit);

const total = await qb.clone().getCount();
const { entities, raw } = await qb.getRawAndEntities();
const data = entities.map((e, i) => ({
  ...e,
  totalAmount: Number(raw[i]?.gr_total_amount ?? 0),
}));
return { data, total, page, limit };
```

> Verify before coding: the line table name + FK column (`goods_receipt_lines.goods_receipt_id`), and that `GoodsReceiptService.list()` branch-scopes (so the v2 handler matches). `FilterBuilder.applyCompare` interpolates `col` into the SQL, so passing the subquery expression works; if it proves awkward, repeat the subquery in an explicit `qb.andWhere`.

## Testing Strategy

- Unit (`search-goods-receipts-v2.handler.spec.ts`): mock the QueryBuilder (chainable, `getCount` + `getRawAndEntities`); assert org+branch `where`, each `FilterBuilder`/`andWhere` call, that `totalAmount` is merged from `raw`, the nested `provider` survives, pagination math, and the `{ data, total, page, limit }` envelope.

## Dependencies

- Depends on: EPIC ACS phase-1 (shared filter DTOs + `FilterBuilder`); the `inventory-item-v2.controller.ts` per-module precedent.
- Blocks: TKT-ILS-04 (OpenAPI regen), TKT-ILS-05 (FE Nhập kho).
