# TKT-PIS-02 BE: Customer purchase-history search endpoint (#2)

## Epic

[EPIC-03062026 POS server-side invoice search](../epics/EPIC-03062026-pos-invoice-search.md)

## Summary

Add a dedicated CQRS search endpoint for the customer "Lịch sử mua hàng" tab (#2): one customer's **finalized** invoices across all stores in the org, with the mockup's columns (Ngày hóa đơn, Số hóa đơn, Tên cửa hàng, Trạng thái, Tổng thanh toán). Org-scoped (NOT branch-scoped — history spans stores). Follows the `cqrs-search-endpoint` skill.

`POST /v2/invoices/purchase-history/search` → `{ data, total, page, limit }`, rows inline `branchName` (Tên cửa hàng), `totalPaid`, `status`.

## Deliverables

- `apps/api/src/modules/pos/dto/purchase-history-search-v2.dto.ts` — `PurchaseHistorySearchV2Dto` (requires `customerId`).
- `apps/api/src/modules/pos/queries/search-purchase-history-v2.query.ts` — `SearchPurchaseHistoryV2Query(dto, actor)`.
- `apps/api/src/modules/pos/queries/search-purchase-history-v2.handler.ts` — `@QueryHandler`.
- `apps/api/src/modules/pos/controllers/purchase-history-v2.controller.ts` — `@Version('2')`, `@RequirePermission('pos.invoice.read')`.
- `apps/api/src/modules/pos/pos.module.ts` — register controller + handler.

## Acceptance Criteria

- [ ] `customerId` is **required** (`@IsUUID()`); base query: `inv.organizationId = actor.organizationId` **AND** `inv.customerId = dto.customerId` **AND** `inv.isDraft = false`. **No branch filter.**
- [ ] `leftJoin` branch; inline `branchName` + `totalPaid` per row; `status` already on the entity.
- [ ] Filters via `FilterBuilder`: `inv.code` ← `code` (String), `inv.issuedAt` ← `issuedAt` (DateRange — the "Ngày hóa đơn" column), `branch.name` ← `storeName` (String, used with EQUALS in UI), `inv.status` ← `status` (Enum; `null`/absent = all → "Tất cả"), `inv.totalPaid` ← `totalPaid` (Compare).
- [ ] Status enum maps to UI: "Đã thanh toán" → `paid`, "Ghi nợ" → `debt`. (No type filter — returns SALE/RETURN/EXCHANGE alike, matching today's `GET /invoices?customerId`.)
- [ ] Sorted `inv.issuedAt DESC` (fallback `createdAt`); paginated; returns `{ data, total, page, limit }`.
- [ ] `POST /v2/invoices/search` unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `search-purchase-history-v2.handler.spec.ts`: org scoping, customerId required + isolation (other customers excluded), drafts excluded, cross-branch rows BOTH returned (no branch filter), each filter, status enum mapping, inline `branchName`.
- [ ] No schema change; `synchronize` false.
- [ ] `pnpm openapi:generate` run; snapshot + `schema.ts` committed.
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
export class PurchaseHistorySearchV2Dto {
  @IsUUID() customerId: string;            // required — whose history

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    code?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) issuedAt?: DateRangeFilterDto;
  @IsOptional() @ValidateNested() @Type(() => StringFilterDto)    storeName?: StringFilterDto;
  @IsOptional() @ValidateNested() @Type(() => EnumFilterDto)      status?: EnumFilterDto;
  @IsOptional() @ValidateNested() @Type(() => CompareFilterDto)   totalPaid?: CompareFilterDto;
}
```

```ts
const qb = this.repo.createQueryBuilder('inv')
  .leftJoin(BranchEntity, 'branch', 'branch.id = inv.branchId')
  .where('inv.organizationId = :orgId', { orgId: actor.organizationId })
  .andWhere('inv.customerId = :cid', { cid: dto.customerId })
  .andWhere('inv.isDraft = false');

new FilterBuilder(qb)
  .applyString('inv.code',       dto.code)
  .applyDateRange('inv.issuedAt', dto.issuedAt)
  .applyString('branch.name',    dto.storeName)
  .applyEnum('inv.status',       dto.status?.value)
  .applyCompare('inv.totalPaid', dto.totalPaid);

qb.orderBy('inv.issuedAt', 'DESC').addOrderBy('inv.createdAt', 'DESC')
  .skip((page - 1) * limit).take(limit);
```

> Inline `branchName`/`totalPaid` onto each row (same raw-merge approach as TKT-PIS-01). Keep the join `leftJoin` + `addSelect` of just `branch.name`, not the whole relation.

## Testing Strategy

- Unit (`search-purchase-history-v2.handler.spec.ts`): seed one customer with invoices across two branches + statuses paid/debt + one draft + another customer; assert isolation, draft exclusion, both branches present, status enum filter, `storeName` EQUALS filter, `totalPaid` compare.

## Dependencies

- Depends on: none (BE root).
- Blocks: TKT-PIS-04, TKT-PIS-06.
