# TKT-CSR-03 Dropdown filter-options endpoint

## Epic

[EPIC-24062026 Chain-Store Report API](../epics/EPIC-24062026-chain-store-report-api.md)

## Summary

Build the missing **shared dropdown-options API** (§A của doc). One endpoint, dispatched by `type`,
serving both dynamic sources (store/cashier/salesperson/customer/productGroup/brand/unit) and static
enum lists (invoiceStatus/statDateType/productType/statBy). This is the single biggest gap — FE
currently mocks all of these.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/queries/get-report-filter-options.query.ts` (new) —
  `GetReportFilterOptionsQuery(dto: ReportFilterOptionsQueryDto, actor: ActorContext)`.
- `apps/api/src/modules/reporting/invoice-report/queries/get-report-filter-options.handler.ts` (new) —
  `@QueryHandler`. Dispatch `dto.type`:
  - `store` → `BranchEntity` (org-scoped) `ILIKE search`, `metadata: { branchId }`.
  - `cashier` / `salesperson` → `EmployeeProfileEntity` (org-scoped) `ILIKE` on name.
  - `customer` → `CustomerEntity` (org-scoped) `ILIKE` on name/phone.
  - `productGroup` → `ItemCategoryEntity` (org-scoped).
  - `brand` → distinct non-null `ItemEntity.brand` (org-scoped) `ILIKE`.
  - `unit` → distinct non-null `ItemEntity.unit` (org-scoped) `ILIKE`.
  - `invoiceStatus|statDateType|productType|statBy` → return the static enum tables from
    `@erp/shared-interfaces` (no DB, search ignored or applied in-memory).
  - unknown → `BadRequestException`.
  - All dynamic queries: org-scoped (`actor.organizationId`), paginated (`page`/`pageSize`),
    `ORDER BY label`. Return `IDropdownOption[]`.
- `apps/api/src/modules/reporting/invoice-report/invoice-report.controller.ts` — add
  `@Get('filter-options')` → dispatch query via `QueryBus`. **Re-enable** `@RequirePermission`
  guard here (`reporting.invoice.branch.read`) rather than leaving it commented.
- `apps/api/src/modules/reporting/invoice-report/invoice-report.module.ts` — register the new handler.
  Entities `BranchEntity`, `EmployeeProfileEntity`, `CustomerEntity`, `ItemCategoryEntity`,
  `ItemEntity` already imported (verified) — no new TypeOrm registration needed.

## Acceptance Criteria

- [ ] All dynamic queries filter by `actor.organizationId`; no cross-tenant leakage.
- [ ] `search` does case-insensitive partial match (`ILIKE %search%`); empty search returns first page.
- [ ] Pagination honored (`page`, `pageSize ≤ 100`); deterministic `ORDER BY`.
- [ ] Enum types return the exact §C value/label set; `statBy` returns `item|parent|group` (not brand).
- [ ] Unknown `type` → 400; invalid `pageSize` → 400 (from DTO).
- [ ] `store` options carry `metadata.branchId`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- get-report-filter-options` green.
- [ ] `pnpm --filter @erp/api lint` passes.
- [ ] No Vietnamese in backend source (labels for enums come from shared-interfaces const tables).
- [ ] Endpoint visible in `/docs` with `type` enum documented.

## Tech Approach

```ts
@QueryHandler(GetReportFilterOptionsQuery)
export class GetReportFilterOptionsHandler {
  async execute({ dto, actor }: GetReportFilterOptionsQuery): Promise<IDropdownOption[]> {
    switch (dto.type) {
      case ReportFilterOptionType.STORE: return this.branches(actor, dto);
      case ReportFilterOptionType.CASHIER:
      case ReportFilterOptionType.SALESPERSON: return this.employees(actor, dto);
      case ReportFilterOptionType.CUSTOMER: return this.customers(actor, dto);
      case ReportFilterOptionType.PRODUCT_GROUP: return this.categories(actor, dto);
      case ReportFilterOptionType.BRAND: return this.distinctItemField(actor, dto, 'brand');
      case ReportFilterOptionType.UNIT: return this.distinctItemField(actor, dto, 'unit');
      case ReportFilterOptionType.INVOICE_STATUS:
      case ReportFilterOptionType.STAT_DATE_TYPE:
      case ReportFilterOptionType.PRODUCT_TYPE:
      case ReportFilterOptionType.STAT_BY: return this.enumOptions(dto);
      default: throw new BadRequestException(`Unknown filter option type: ${dto.type}`);
    }
  }
}
```

## Testing Strategy

- Unit (`get-report-filter-options.handler.spec.ts`): seed 2 orgs → assert org isolation; assert
  `ILIKE` search narrows results; assert enum types return static §C tables; unknown type → throws.

## Dependencies

- Depends on: TKT-CSR-02.
- Blocks: TKT-CSR-07.
