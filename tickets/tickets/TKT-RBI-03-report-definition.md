# TKT-RBI-03 BE: `RevenueByItemReport` + filter DTO (groupBy/category/brand)

## Epic

[EPIC-15062026 Doanh thu theo mặt hàng](../epics/EPIC-15062026-revenue-by-item-report.md)

## Summary

`ReportDefinition` thứ 4 `RevenueByItemReport` (key `revenue-by-item`): `buildColumns` từ registry RBI-02; `buildData` = scope → load invoices+lines → resolve item metadata (category/brand/unit inline) → lọc `categoryId`/`brand` (JS) → `aggregateByItem(rows, groupBy)` → per-column filter → phân trang → totals. Thêm `groupBy`/`categoryId`/`brand` (optional) vào `InvoiceReportFilterDto`.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/reports/revenue-by-item.report.ts` — `@Injectable() RevenueByItemReport implements ReportDefinition`.
- `apps/api/src/modules/reporting/invoice-report/dto/invoice-report-filter.dto.ts` — thêm `@IsOptional()` `groupBy?: ReportGroupBy` (`@IsEnum`), `categoryId?: string` (`@IsUUID`), `brand?: string` (`@IsString`).

## Acceptance Criteria

- [ ] `key = 'revenue-by-item'`. `buildColumns` map `REVENUE_BY_ITEM_COLUMNS` → header (`group:null`, `name` từ `INVOICE_REPORT_COLUMN_LABELS_VI`, `desc:null`).
- [ ] `buildData`: bắt buộc `filters.issuedAt.from` (`BadRequestException` nếu thiếu); validate `dto.columns` + `columnFilters.col` ∈ registry (`isKnownRevenueByItemColumn`).
- [ ] Scope: `organizationId` + `resolveBranchScope` (mirror type #3, gated `reporting.invoice.consolidated.read`); `status != CANCELLED`; `FilterBuilder.applyDateRange(issuedAt)` + `applyEnum(status/type)`.
- [ ] Resolve item metadata 1 lần: load `ItemEntity` theo `lines.itemId` → `categoryId`→category name, `brand`, `unit` (fallback `line.unit`). Inline lên `RevenueByItemRowInput` (KHÔNG root map).
- [ ] Lọc **trong JS**: `categoryId` (theo `item.categoryId`) + `brand` (theo `item.brand`) trước khi aggregate.
- [ ] Gộp theo `dto.filters.groupBy ?? ReportGroupBy.ITEM`; `dataRaw`/`totals` chỉ phát cột trong `dto.columns`, đúng thứ tự gửi lên.
- [ ] Phân trang trên **nhóm đã gộp** (`page`/`limit`); `total` = số nhóm sau filter.
- [ ] Report khác **không** bị ảnh hưởng bởi field filter mới (chúng không đọc).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; unit spec handler (mock repo) phủ 3 groupBy + 2 filter + thiếu issuedAt + cột lạ.
- [ ] Không Vietnamese trong source. Không entity/migration/endpoint mới.

## Tech Approach

```ts
@Injectable()
export class RevenueByItemReport implements ReportDefinition {
  readonly key = 'revenue-by-item';
  constructor(
    @InjectRepository(InvoiceEntity) private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity) private readonly lineItems: Repository<InvoiceItemEntity>,
    @InjectRepository(ItemEntity) private readonly catalogItems: Repository<ItemEntity>,
    @InjectRepository(ItemCategoryEntity) private readonly categories: Repository<ItemCategoryEntity>,
    private readonly rbac: RbacService,
  ) {}

  async buildData(dto, actor): Promise<InvoiceReportResult> {
    const page = dto.page ?? 1, limit = dto.limit ?? 31;
    if (!dto.filters?.issuedAt?.from) throw new BadRequestException('filters.issuedAt.from is required');
    // validate columns ∈ registry … (mirror item-detail)
    const branchId = await this.resolveBranchScope(dto.branchId ?? dto.filters.branchId, actor);
    const invoices = await this.scopedInvoices(actor, branchId, dto.filters); // qb + FilterBuilder
    const lines = await this.lineItems.find({ where: { invoiceId: In(ids) } });
    const itemMeta = await this.loadItemMeta(lines, actor.organizationId); // {category,brand,unit} per itemId
    let rows: RevenueByItemRowInput[] = lines.map((li) => toRow(li, itemMeta.get(li.itemId)));
    if (dto.filters.categoryId) rows = rows.filter(r => r.categoryId... ); // by item.categoryId
    if (dto.filters.brand) rows = rows.filter(r => r.brand === dto.filters.brand);
    const groups = aggregateByItem(rows, dto.filters.groupBy ?? ReportGroupBy.ITEM);
    const filtered = applyColumnFilters(groups, dto.columnFilters); // matchColumnFilter on itemGroupCellValue
    const pageRows = filtered.slice((page-1)*limit, (page-1)*limit + limit);
    return {
      dataRaw: pageRows.map(g => buildItemGroupRow(dto.columns, g)),
      totals: filtered.length ? buildItemGroupTotals(dto.columns, filtered) : null,
      total: filtered.length, page, limit,
    };
  }
}
```

> Lọc `categoryId` cần `item.categoryId` (id), nên `RevenueByItemRowInput` giữ thêm `categoryId` nội bộ (hoặc lọc trên `itemMeta` trước khi map). Brand lọc theo chuỗi `items.brand`.

## Testing Strategy

- Unit handler: mock 4 repo + RbacService; assert gộp/lọc/scope/totals theo từng groupBy.

## Dependencies

- Depends on: TKT-RBI-01, TKT-RBI-02
- Blocks: TKT-RBI-04
