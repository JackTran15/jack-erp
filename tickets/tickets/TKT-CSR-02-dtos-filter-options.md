# TKT-CSR-02 DTOs: filter / column-filter / options query

## Epic

[EPIC-24062026 Chain-Store Report API](../epics/EPIC-24062026-chain-store-report-api.md)

## Summary

Add the request-side DTOs for the extended search filters, the new text column-filter operators, and
the new dropdown options query. class-validator + `@ApiProperty` on every accepted field (global
`whitelist: true, forbidNonWhitelisted: true`).

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/dto/invoice-report-filter.dto.ts` — extend
  `InvoiceReportFilterDto`:
  - `store?: StoreScopeDto` (nested) — `{ scope: 'all'|'group'; storeIds: string[] (UUID[]) }`.
  - `invoiceStatus?: string[]` (`@IsArray`, `@IsString({each})`).
  - `statDateType?: 'invoice_date'|'created_date'` (`@IsIn`).
  - `productType?: 'product'|'service'|'combo'` (`@IsIn`).
  - `statBy?: ReportGroupBy` (`@IsEnum`, now `item|parent|group`).
  - `statisticByBrand?: boolean`, `allocateComboRevenue?: boolean` (`@IsBoolean`).
  - Keep existing fields.
- `apps/api/src/modules/reporting/invoice-report/dto/store-scope.dto.ts` (new) — `StoreScopeDto`.
- `apps/api/src/modules/reporting/invoice-report/dto/column-filter.dto.ts` — add text operators:
  `contains?`, `equals?`, `startsWith?`, `endsWith?`, `notContains?` (`@IsString`, `@IsOptional`).
- `apps/api/src/modules/reporting/invoice-report/dto/report-filter-options-query.dto.ts` (new) —
  `ReportFilterOptionsQueryDto`: `type: ReportFilterOptionType` (`@IsEnum`, required),
  `search?: string`, `page?: number = 1` (`@Min(1)`), `pageSize?: number = 20` (`@Min(1) @Max(100)`).
  `@Type(() => Number)` for the query-string ints.

## Acceptance Criteria

- [ ] Every field has `@ApiProperty`/`@ApiPropertyOptional`; unknown fields rejected by global pipe.
- [ ] `StoreScopeDto.storeIds` validated as UUID array; `scope` constrained to `all|group`.
- [ ] No Vietnamese in DTO source.

## Definition of Done

- [ ] `pnpm --filter @erp/api lint` passes for the changed files.
- [ ] Diff limited to the listed DTO files.

## Tech Approach

```ts
export class StoreScopeDto {
  @ApiProperty({ enum: ['all', 'group'] }) @IsIn(['all', 'group']) scope!: 'all' | 'group';
  @ApiProperty({ type: [String] }) @IsArray() @IsUUID('4', { each: true }) storeIds!: string[];
}

export class ReportFilterOptionsQueryDto {
  @ApiProperty({ enum: ReportFilterOptionType }) @IsEnum(ReportFilterOptionType)
  type!: ReportFilterOptionType;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 20;
}
```

## Testing Strategy

- Validation covered by handler/e2e specs in CSR-03/05/09 (invalid `type`, oversized `pageSize`,
  non-UUID `storeIds` → 400).

## Dependencies

- Depends on: TKT-CSR-01.
- Blocks: TKT-CSR-03, TKT-CSR-05.
