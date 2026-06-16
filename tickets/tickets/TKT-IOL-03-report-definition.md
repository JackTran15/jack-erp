# TKT-IOL-03 BE: InvoiceOrderListingReport (buildColumns + buildData một dòng/hóa đơn)

## Epic

[EPIC-14062026 Bảng kê hóa đơn và đơn hàng](../epics/EPIC-14062026-invoice-order-listing-report.md)

## Summary

Hiện thực `ReportDefinition` thứ 2 — `InvoiceOrderListingReport` (key `invoice-order-listing`). `buildColumns` trả catalog cột MISA (cố định từ `INVOICE_LISTING_COLUMNS` + nhãn VI + append cột động `payment.method.<id>` từ `PaymentAccountEntity`). `buildData` fetch raw hóa đơn (`status != cancelled`, trong `filters.issuedAt`, theo scope), join inline customer/branch/employee/payments/promotions, dựng **một dòng / một hóa đơn** trong JS qua aggregator TKT-IOL-02, áp `columnFilters` post-build, trả `{ dataRaw, totals, total, page, limit }`. Mirror cấu trúc `DailySalesSummaryReport` nhưng granularity per-invoice.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/reports/invoice-order-listing.report.ts` (mới) — `@Injectable() class InvoiceOrderListingReport implements ReportDefinition`.
- `apps/api/src/modules/reporting/invoice-report/reports/invoice-order-listing.report.spec.ts` (mới).

## Acceptance Criteria

- [ ] `key === 'invoice-order-listing'`.
- [ ] `buildColumns(actor)`: trả cố định (từ `INVOICE_LISTING_COLUMNS`, `name` = `INVOICE_REPORT_COLUMN_LABELS_VI[key] ?? key`, `group` = band qua `INVOICE_REPORT_BAND_LABELS_VI`) **+** append 1 cột động / 1 `PaymentAccountEntity` active (`col: dynamicColumnKey(accountId)`, `name = account.label`, band `customerPayment`, dedupe theo accountId). Không lộ payment-account org khác.
- [ ] `buildData`: bắt buộc `filters.issuedAt.from` (thiếu → `BadRequestException`); validate mọi `columns` + `columnFilters[].col` ∈ catalog (cố định ∈ registry; động ∈ payment-account active) → lạ → `BadRequestException`.
- [ ] Scope: `resolveBranchScope(dto.branchId ?? dto.filters.branchId, actor)` (gate `reporting.invoice.consolidated.read`); branch khác mà không có quyền → `ForbiddenException`.
- [ ] Query: `organizationId = actor.organizationId` AND `status != cancelled` AND (branch nếu có) + `FilterBuilder.applyDateRange('invoice.issuedAt', issuedAt).applyEnum('invoice.status', …).applyEnum('invoice.type', …)`.
- [ ] **Một dòng / một hóa đơn** (KHÔNG group-by ngày). FK resolve **inline** vào từng dòng (customer/branch/employee), KHÔNG root map.
- [ ] Payments/promotions fetch theo `invoiceId IN (...)` và pivot per-invoice (cash/bankTransfer/voucher/byAccount). Chỉ fetch khi cột tham chiếu cần (như `DailySalesSummaryReport` dùng `needsPayments`/`needsPromotions`).
- [ ] Cột PLACEHOLDER trả `0`/`null` tất định; DERIVED tính server-side.
- [ ] `columnFilters` áp **post-build** (sau khi dựng dòng) qua `matchColumnFilter`; `totals` (cột tiền) tính trên tập dòng **sau filter**; phân trang `page`/`limit` trên tập đã lọc.
- [ ] `daily-sales-summary` không regress.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- invoice-order-listing` xanh.
- [ ] `pnpm --filter @erp/api test -- invoice-report` (daily-sales) vẫn xanh.
- [ ] Không tiếng Việt trong source; không TODO/FIXME ngoài kế hoạch.
- [ ] `synchronize` vẫn false; không schema change.

## Tech Approach

```ts
@Injectable()
export class InvoiceOrderListingReport implements ReportDefinition {
  readonly key = 'invoice-order-listing';

  constructor(
    @InjectRepository(InvoiceEntity) private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoicePaymentEntity) private readonly payments: Repository<InvoicePaymentEntity>,
    @InjectRepository(InvoicePromotionEntity) private readonly promotions: Repository<InvoicePromotionEntity>,
    @InjectRepository(PaymentAccountEntity) private readonly paymentAccounts: Repository<PaymentAccountEntity>,
    @InjectRepository(CustomerEntity) private readonly customers: Repository<CustomerEntity>,
    @InjectRepository(BranchEntity) private readonly branches: Repository<BranchEntity>,
    @InjectRepository(EmployeeProfileEntity) private readonly employees: Repository<EmployeeProfileEntity>,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(actor: ActorContext): Promise<ReportColumnHeader[]> {
    const fixed = INVOICE_LISTING_COLUMNS.map((c) => ({
      col: c.key,
      name: INVOICE_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
      desc: INVOICE_REPORT_COLUMN_DESCS[c.key] ?? null,
      type: c.type,
      group: band(c.group), // band() merge INVOICE_REPORT_BAND_LABELS_VI; null cho cột nền
    }));
    const accounts = await this.activeAccounts(actor); // dedupe accountId → cột động band customerPayment
    return [...fixed, ...dynamic];
  }

  async buildData(dto: InvoiceReportSearchDto, actor: ActorContext): Promise<InvoiceReportResult> {
    if (!dto.filters?.issuedAt?.from) throw new BadRequestException('filters.issuedAt.from is required');
    // validate columns + columnFilters.col ∈ catalog (cố định ∈ INVOICE_LISTING_COLUMNS; động ∈ active accounts) → 400
    const branchId = await this.resolveBranchScope(dto.branchId ?? dto.filters.branchId, actor);

    const qb = this.invoices.createQueryBuilder('invoice')
      .where('invoice.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('invoice.status != :cancelled', { cancelled: InvoiceStatus.CANCELLED });
    if (branchId) qb.andWhere('invoice.branchId = :branchId', { branchId });
    new FilterBuilder(qb)
      .applyDateRange('invoice.issuedAt', dto.filters.issuedAt)
      .applyEnum('invoice.status', dto.filters.status?.value)
      .applyEnum('invoice.type', dto.filters.type?.value);
    const invoiceRows = (await qb.getMany()).filter((i) => i.issuedAt);

    // fetch payments/promotions theo invoiceId[] (chỉ khi cột cần) + resolve customer/branch/employee inline
    // build InvoiceRowInput[] → buildInvoiceRow(dto.columns, row) cho từng hóa đơn
    // áp columnFilters (post-build) → phân trang → buildListingTotals(dto.columns, filteredRows)
    return { dataRaw, totals, total, page, limit };
  }
  // resolveBranchScope: mirror DailySalesSummaryReport (gate reporting.invoice.consolidated.read)
}
```

- **Branch join quirk:** `invoice.branchId` là `varchar`; nếu join `branches` bằng QueryBuilder phải cast `::uuid` (memory `reference_branchid_varchar_and_typeorm_cast`). Đơn giản hơn: resolve branch/customer/employee bằng `find({ where: { id: In(ids) } })` rồi map inline trong JS (đúng feedback in-memory + inline-relations), tránh cast SQL.
- **Cashier/salesperson label:** `employee_profiles` map theo `user_id` (`staffId`/`salespersonId`) → `code` (hoặc tên hiển thị) — chốt field hiển thị khi implement.

## Testing Strategy

- `invoice-order-listing.report.spec.ts` (mock repos): `buildColumns` (cố định + động + band + placeholder có mặt); `buildData` happy path (một dòng/hóa đơn, inline FK, pivot payment, computed, placeholder 0/null); `issuedAt` thiếu → 400; cột lạ → 400; `status=cancelled` bị loại; `columnFilters` post-build + totals trên tập đã lọc; scope/consolidated (branch khác → 403).

## Dependencies

- Depends on: TKT-IOL-01, TKT-IOL-02
- Blocks: TKT-IOL-04
