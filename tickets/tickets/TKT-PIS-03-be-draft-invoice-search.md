# TKT-PIS-03 BE: Draft-invoice search endpoint (#4)

## Epic

[EPIC-03062026 POS server-side invoice search](../epics/EPIC-03062026-pos-invoice-search.md)

## Summary

Add a dedicated CQRS search endpoint for the "Hóa đơn chưa thanh toán" held-drafts dialog (#4): server-side **free-text** search (ORs over invoice code / customer name / customer phone) + a created-date range, over the org's held drafts, paginated. Replaces the current in-memory filtering of `GET /invoices/drafts`.

`POST /v2/invoices/drafts/search` → `{ data, total, page, limit }`, rows inline `customerName`/`customerPhone` (+ `branchName` for parity).

## Decision needed at implementation

**Session scoping.** `GET /invoices/drafts` scopes `findDrafts(sessionId, actor)` by `organizationId + sessionId + isDraft`, but the FE service has `session_id` **commented out**, so today it returns *all* org drafts. This ticket keeps the **current effective behaviour** (org + branch scoped, no session) and exposes an **optional** `sessionId` filter so TKT-PIS-07 can opt back into session scoping without another BE change. Flag this to the reviewer; do not silently re-enable session scoping.

## Deliverables

- `apps/api/src/modules/pos/dto/draft-invoice-search-v2.dto.ts` — `DraftInvoiceSearchV2Dto`.
- `apps/api/src/modules/pos/queries/search-draft-invoices-v2.query.ts` — `SearchDraftInvoicesV2Query(dto, actor)`.
- `apps/api/src/modules/pos/queries/search-draft-invoices-v2.handler.ts` — `@QueryHandler`.
- `apps/api/src/modules/pos/controllers/draft-invoice-v2.controller.ts` — `@Version('2')`, `@RequirePermission('pos.invoice.read')`.
- `apps/api/src/modules/pos/pos.module.ts` — register controller + handler.

## Acceptance Criteria

- [ ] Base query: `inv.organizationId = actor.organizationId` **AND** `inv.isDraft = true`; branch-scoped by `actor.branchId` when present; optional `inv.sessionId = dto.sessionId` when supplied.
- [ ] Free-text `search`: a single `Brackets` OR group → `inv.code ILIKE :q OR customer.name ILIKE :q OR customer.phone ILIKE :q` (FilterBuilder has no OR — build the bracket manually). No-op when blank.
- [ ] `createdAt` DateRange filter via `FilterBuilder.applyDateRange('inv.createdAt', …)`.
- [ ] `leftJoin` customer (+ branch) and inline `customerName`/`customerPhone` (+ `branchName`) per row.
- [ ] Sorted `inv.createdAt DESC`; paginated; `{ data, total, page, limit }`.
- [ ] `POST /v2/invoices/search` unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `search-draft-invoices-v2.handler.spec.ts`: only `isDraft=true` rows; org+branch scoping; free-text OR hits each of code/name/phone; blank search returns all; optional `sessionId` narrows; createdAt range; pagination.
- [ ] No schema change; `synchronize` false.
- [ ] `pnpm openapi:generate` run; snapshot + `schema.ts` committed.
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
export class DraftInvoiceSearchV2Dto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @IsString() search?: string;        // ORs over code / customer name / phone
  @IsOptional() @ValidateNested() @Type(() => DateRangeFilterDto) createdAt?: DateRangeFilterDto;
  @IsOptional() @IsString() sessionId?: string;     // optional session scoping (see decision)
}
```

```ts
import { Brackets } from 'typeorm';

const qb = this.repo.createQueryBuilder('inv')
  .leftJoin(CustomerEntity, 'customer',
    'customer.id = inv.customerId AND customer.organizationId = inv.organizationId')
  .leftJoin(BranchEntity, 'branch', 'branch.id = inv.branchId')
  .where('inv.organizationId = :orgId', { orgId: actor.organizationId })
  .andWhere('inv.isDraft = true');

if (actor.branchId) qb.andWhere('inv.branchId = :branchId', { branchId: actor.branchId });
if (dto.sessionId)  qb.andWhere('inv.sessionId = :sid', { sid: dto.sessionId });

const q = dto.search?.trim();
if (q) {
  qb.andWhere(new Brackets((w) => {
    w.where('inv.code ILIKE :q', { q: `%${q}%` })
     .orWhere('customer.name ILIKE :q', { q: `%${q}%` })
     .orWhere('customer.phone ILIKE :q', { q: `%${q}%` });
  }));
}

new FilterBuilder(qb).applyDateRange('inv.createdAt', dto.createdAt);
qb.orderBy('inv.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
```

> The single `:q` param is reused inside the bracket — that's fine (one bound value). Inline customer/branch fields onto rows as in TKT-PIS-01. Items/line detail for the right-hand panel stay on the existing per-invoice fetch; this endpoint only powers the left list.

## Testing Strategy

- Unit (`search-draft-invoices-v2.handler.spec.ts`): seed drafts + non-drafts across branches/sessions, with customers whose name/phone/code variously match a query; assert OR coverage, blank-search passthrough, draft-only, scoping, optional session narrowing.

## Dependencies

- Depends on: none (BE root).
- Blocks: TKT-PIS-04, TKT-PIS-07.
