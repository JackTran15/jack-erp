# TKT-IRB-04 BE: SearchInvoiceReportQuery + handler (aggregate theo ngày trong JS + pivot + computed + totals)

## Epic

[EPIC-11062026 Báo cáo tổng hợp bán hàng theo ngày](../epics/EPIC-11062026-invoice-report-builder.md)

## Summary

Trái tim feature: query CQRS `SearchInvoiceReportQuery` đổ dữ liệu **tổng hợp theo ngày** (một dòng / một ngày) theo `columns[]` + `filters` (bắt buộc khoảng ngày), scope theo cửa hàng/chuỗi. Handler validate cột (cố định ∈ registry; động ∈ payment-account của org), **fetch raw** invoice rows (+ `invoice_payments`) trong khoảng/scope, **group theo ngày trong JS** (đúng feedback `prefer_in_memory_aggregation` — KHÔNG `GROUP BY` SQL), sum cột cố định + **pivot theo payment account** cho cột động, compute cột dẫn xuất (Tổng/Thực thu/Tỷ lệ KM %), build `dataRaw: ReportCell[][]` + `totals: ReportCell[]`. Route `POST /reports/invoices/search`.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/dto/invoice-report-filter.dto.ts` — **scope filter** `InvoiceReportFilterDto` (tái dùng sub-DTO `common/filters/filter.dto.ts`, giống `SearchInvoicesV2`): `issuedAt: DateRangeFilterDto` (**bắt buộc** — `@ValidateNested @Type @IsDefined`), `status?: EnumFilterDto`, `type?: EnumFilterDto`, `branchId?: @IsUUID @IsOptional`.
- `.../dto/column-filter.dto.ts` — **per-column filter** `ColumnFilterDto` (mirror `CompareFilterDto` + `DateRangeFilterDto`): `@IsString col`; `@IsOptional eq?`; `@IsOptional @IsNumber lt?/lte?/gt?/gte?`; `@IsOptional from?/to?` (cho cột `date`). Áp post-aggregate.
- `.../dto/invoice-report-search.dto.ts` — `InvoiceReportSearchDto`: `@ArrayNotEmpty @IsString({each:true}) columns: string[]`; `@ValidateNested @Type(()=>InvoiceReportFilterDto) @IsDefined filters`; `@IsOptional @ValidateNested({each:true}) @Type(()=>ColumnFilterDto) columnFilters?`; `@IsUUID @IsOptional branchId?`; `page?` (`@Min(1)` default 1); `limit?` (`@Min(1) @Max(366)` default 31 — đủ một tháng ngày). Khai báo **đủ field** (global whitelist/forbidNonWhitelisted).
- `.../queries/search-invoice-report.query.ts` — `SearchInvoiceReportQuery { dto, actor }`.
- `.../queries/search-invoice-report.handler.ts` — `@QueryHandler` inject `@InjectRepository(InvoiceEntity)` + `@InjectRepository(InvoicePaymentEntity)` + `@InjectRepository(PaymentAccountEntity)` + `RbacService`. Logic dưới.
- `invoice-report.controller.ts` — thêm `@Post('search')` + `@RequirePermission('reporting.invoice.branch.read')` → dispatch query. `@ApiOkResponse` shape `InvoiceReportResult`.
- `invoice-report.module.ts` — thêm `SearchInvoiceReportHandler` vào providers.

## Acceptance Criteria

- [ ] `columns` **hoặc** `columnFilters[].col` chứa key cố định ngoài registry **hoặc** id payment-account động không thuộc org → **400** (`BadRequestException`) trước khi chạm dữ liệu nặng.
- [ ] Thiếu `filters.issuedAt` → **400** (validation DTO).
- [ ] Aggregate **một dòng / một ngày** theo `issuedAt` (timezone nhất quán; `to` day-inclusive — memory `reference_branchid_varchar_and_typeorm_cast`); sắp theo ngày tăng/giảm nhất quán.
- [ ] Cột cố định `agg:'sum'` = tổng field tương ứng trong ngày; cột computed (`revenue.total`, `actualRevenue`, `revenue.promoRate`) tính từ các tổng đã gom (đúng công thức `desc`).
- [ ] Cột động (`revenue.method.<id>` / `payment.method.<id>`) = tổng `invoice_payments.amount` theo `account_id` khớp `paymentAccountId`, gom theo ngày; account không có giao dịch trong ngày → `0` (không null), giữ ô để bảng đều cột.
- [ ] Scope: luôn `where invoice.organizationId = actor.organizationId`. Branch scope qua logic `resolveBranchScope`: có `reporting.invoice.consolidated.read` → `branchId` rỗng = toàn chuỗi, hoặc dùng `dto.branchId`; không có → ép `actor.branchId`, `dto.branchId` ≠ branch mình → **403**.
- [ ] **Per-column filter** (`columnFilters`) áp **post-aggregate** lên giá trị ngày của cột (kể cả computed/động): `eq/lt/lte/gt/gte` cho số, `from/to`/`eq` cho `date`; ngày không thỏa **mọi** điều kiện → loại khỏi `dataRaw`. (Scope `status/type/issuedAt/branch` áp pre-aggregate ở SQL qua `FilterBuilder`.)
- [ ] `dataRaw: ReportCell[][]` — mỗi dòng chỉ chứa cell của **cột đã chọn** (theo thứ tự `columns`), mỗi cell `{ col, type, value }` với `type` đúng từ registry/động; `value` primitive (Date→ISO). **KHÔNG** trả `headers` (lấy từ API columns).
- [ ] `totals: ReportCell[]` = tổng các dòng **sau filter** cho mỗi cột số (cột `date` ở totals → `null`; cột computed tính lại trên tổng đã lọc, không cộng dồn % ngày).
- [ ] Envelope `{ dataRaw, totals, total, page, limit }` (không `headers`); `total` = số ngày **sau filter** (đếm độc lập với LIMIT phân trang theo ngày).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; app boot.
- [ ] `search-invoice-report.handler.spec.ts` phủ: reject cột lạ (cố định + động); 400 thiếu ngày; aggregate gom đúng theo ngày; pivot payment-account đúng; computed đúng công thức; scope org; consolidated vs branch (+403); totals; cell shape/type.
- [ ] Không schema change; `synchronize` false.
- [ ] Backend source tiếng Anh.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
@QueryHandler(SearchInvoiceReportQuery)
export class SearchInvoiceReportHandler implements IQueryHandler<SearchInvoiceReportQuery> {
  constructor(
    @InjectRepository(InvoiceEntity) private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoicePaymentEntity) private readonly payments: Repository<InvoicePaymentEntity>,
    @InjectRepository(PaymentAccountEntity) private readonly accounts: Repository<PaymentAccountEntity>,
    private readonly rbac: RbacService,
  ) {}

  async execute({ dto, actor }: SearchInvoiceReportQuery): Promise<InvoiceReportResult> {
    // 1) validate ALL referenced columns (selected + filtered): fixed ∈ registry, dynamic ∈ org payment-accounts
    const activeIds = new Set((await this.accounts.find({
      where: { organizationId: actor.organizationId, isActive: true },
    })).map((a) => a.id));
    const referenced = [...dto.columns, ...(dto.columnFilters ?? []).map((f) => f.col)];
    const known = (k: string) => isKnownSummaryColumn(k) || (() => { const d = parseDynamicColumnKey(k); return !!(d && activeIds.has(d.paymentAccountId)); })();
    const unknown = referenced.filter((k) => !known(k));
    if (unknown.length) throw new BadRequestException(`Unknown report columns: ${[...new Set(unknown)].join(', ')}`);

    // 2) scope
    const branchId = await this.resolveBranchScope(dto.branchId ?? dto.filters.branchId, actor); // string | null

    // 3) fetch raw invoices in date range + scope (NO group-by SQL — feedback prefer_in_memory_aggregation)
    const qb = this.invoices.createQueryBuilder('invoice')
      .where('invoice.organizationId = :orgId', { orgId: actor.organizationId });
    if (branchId) qb.andWhere('invoice.branchId = :branchId', { branchId });
    new FilterBuilder(qb)
      .applyDateRange('invoice.issuedAt', dto.filters.issuedAt) // 'to' day-inclusive
      .applyEnum('invoice.status', dto.filters.status?.value)
      .applyEnum('invoice.type', dto.filters.type?.value);
    const invoiceRows = await qb.getMany();

    // 4) fetch payments for those invoices (only if any dynamic / cash column requested)
    const invoiceIds = invoiceRows.map((i) => i.id);
    const needsPayments = dto.columns.some((k) => isDynamicColumnKey(k) || k === 'revenue.cash' || k === 'payment.voucher' || k === 'payment.points');
    const paymentRows = needsPayments && invoiceIds.length
      ? await this.payments.find({ where: { invoiceId: In(invoiceIds) } })
      : [];

    // 5) group by DAY in JS → buckets keyed by yyyy-mm-dd
    const buckets = this.bucketByDay(invoiceRows, paymentRows); // Map<dayIso, Aggregate>

    // 5b) per-column filter POST-aggregate (on each day's aggregated/computed value)
    let days = [...buckets.keys()].sort();                      // ascending by day
    if (dto.columnFilters?.length) {
      days = days.filter((d) =>
        dto.columnFilters!.every((f) => matchColumnFilter(this.cellValue(f.col, buckets.get(d)!), f)));
    }
    const total = days.length;                                  // count AFTER filter
    const offset = ((dto.page ?? 1) - 1) * (dto.limit ?? 31);
    const pageDays = days.slice(offset, offset + (dto.limit ?? 31));

    // 6) build rows + totals (NO headers — those come from GET /columns)
    const dataRaw = pageDays.map((d) => this.buildRow(dto.columns, buckets.get(d)!));
    const totals = this.buildTotals(dto.columns, days.map((d) => buckets.get(d)!)); // over FILTERED days

    return { dataRaw, totals, total, page: dto.page ?? 1, limit: dto.limit ?? 31 };
  }
}
```

- `cellValue(col, agg)`: trả giá trị tổng hợp của một cột cho một ngày (sum/computed/pivot) — dùng chung bởi `buildRow` và bước filter, đảm bảo filter áp đúng trên cùng giá trị FE thấy.
- `matchColumnFilter(value, f)`: áp `eq/lt/lte/gt/gte` (số) hoặc `from/to`/`eq` (date) — mọi điều kiện đặt trong `f` phải đúng (AND). Tái dùng semantics `CompareFilter`/`DateRangeFilter` của `common/filters` cho nhất quán với search hiện tại.
- `buildTotals(columns, aggs[])`: cộng các cột số trên tập ngày đã lọc; cột computed tính lại trên tổng; cột `date` → `null`.

- `bucketByDay`: với mỗi invoice cộng vào bucket ngày (`issuedAt` → `yyyy-mm-dd` theo tz nhất quán) các tổng cố định (`subtotal`/`fee`/`discountAmount`/…); với mỗi payment cộng vào `byAccount[accountId]` của bucket ngày của invoice cha. Map invoice→day một lần để gắn payment đúng ngày.
- `buildRow(columns, agg)`: với mỗi key →
  - cố định `agg:'sum'` → `value = agg.sums[source]`;
  - computed → `actual/total/promoRate` tính từ `agg.sums`;
  - động `revenue.method.<id>` / `payment.method.<id>` → `value = agg.byAccount[id] ?? 0`;
  - `date` → `value = dayIso`;
  - đóng gói `{ col, type: typeOf(col), value }` (type cố định từ registry, động = CURRENCY).
- `revenue.promoRate` (PERCENT): tính trên tổng đã gom của dòng (vd `discount / (goods+fee) * 100`) — **không** cộng trung bình % các hóa đơn; reconcile công thức `(6)` với báo cáo gốc khi implement.
- `totals`: cột số = tổng toàn khoảng; cột computed = tính lại trên tổng toàn khoảng (không cộng % theo ngày); cột `date` → `null`.
- `resolveBranchScope`: mirror `ReportingService` — `hasPermission('reporting.invoice.consolidated.read')`; 403 khi `branchId` ≠ `actor.branchId` & không consolidated. Ưu tiên nâng logic `ReportingService.resolveBranchScope` thành helper export dùng chung để tránh lệch.

> ⚠️ `source` field map (`subtotal`/`fee`/`discountAmount`/`promoPoints`/`cashAmount`/`voucherAmount`/`pointsAmount`) phải **đọc `InvoiceEntity`/`InvoicePaymentEntity` thật trước khi chốt** — tên field reconcile khi implement, không bịa. Nếu `revenue.cash`/`payment.voucher`/`payment.points` không có field tổng sẵn trên invoice mà phải suy từ `invoice_payments` theo `paymentMethod`, tính ở bước pivot (giống cột động) thay vì `source` trên invoice.

## Testing Strategy

- Unit (`search-invoice-report.handler.spec.ts`): mock repo invoices/payments/accounts + `RbacService`; seed 2 ngày × vài invoice/payment → assert: reject cột lạ trong `columns` **và** `columnFilters[].col`; 400 thiếu `issuedAt`; số dòng = số ngày; sum cố định + pivot động đúng; computed đúng; **per-column filter post-aggregate** (vd `columnFilters:[{col:'revenue.goods',lte:N}]` loại đúng ngày, `totals` tính lại trên tập đã lọc); scope/403; cell `{col,type,value}`; envelope không có `headers`. Seed-based e2e ở TKT-09.

## Dependencies

- Depends on: [TKT-IRB-03](./TKT-IRB-03-be-column-registry-catalog.md) (registry + helper + cột động), [TKT-IRB-02](./TKT-IRB-02-shared-interfaces.md), [TKT-IRB-01](./TKT-IRB-01-be-schema-entity-module.md).
- Blocks: [TKT-IRB-06](./TKT-IRB-06-be-permissions-openapi.md), [TKT-IRB-09](./TKT-IRB-09-tests-e2e.md).
