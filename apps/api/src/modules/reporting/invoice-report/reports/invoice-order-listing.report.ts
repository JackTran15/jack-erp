import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  INVOICE_REPORT_BAND_LABELS_VI,
  INVOICE_REPORT_COLUMN_LABELS_VI,
  InvoiceReportResult,
  REPORT_ROW_INVOICE_ID,
  ReportColumnDataType,
  ReportColumnGroup,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { PaymentAccountEntity } from '../../../accounting/payment-accounts/payment-account.entity';
import { BranchEntity } from '../../../branch/branch.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
} from '../../../pos/entities/invoice.entity';
import { InvoiceItemEntity } from '../../../pos/entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
import { InvoicePromotionEntity, InvoicePromotionType } from '../../../promotion/invoice-promotion.entity';
import { EmployeeProfileEntity } from '../../../rbac/employee/employee-profile.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { InvoiceReportSearchDto } from '../dto/invoice-report-search.dto';
import { matchColumnFilter } from '../invoice-report.aggregator';
import {
  dynamicColumnKey,
  isDynamicColumnKey,
  parseDynamicColumnKey,
} from '../invoice-report.columns';
import {
  INVOICE_LISTING_COLUMNS,
  isKnownListingColumn,
  ListingBandId,
} from '../invoice-listing.columns';
import {
  buildInvoiceRow,
  buildListingTotals,
  InvoiceRowInput,
  listingCellValue,
  listingColumnType,
} from '../invoice-listing.aggregator';
import { enrichHeader } from '../report-column.util';
import {
  applyBranchScope,
  applyInvoiceStatusFilter,
  CONSOLIDATED_PERMISSION,
  invoiceTypeSign,
  loadSignedLineDiscounts,
  resolveBranchIds,
  signedGoods,
  statDateColumn,
} from '../../report-core/report-query.util';
import { ReportDefinition } from '../report-definition';
import {
  businessDayEnd,
  businessDayStart,
  isCalendarDate,
} from '../../../../common/utils/business-timezone.util';
import { ReportExportSource } from '../../report-core/report-definition';

const band = (id: ListingBandId | null): ReportColumnGroup | null =>
  id ? { id, name: INVOICE_REPORT_BAND_LABELS_VI[id] ?? id } : null;

/** A period picked by day, widened to the instants that day spans locally. */
const toInstantRange = (
  period?: { from?: string; to?: string },
): { from?: string; to?: string } | null => {
  if (!period) return null;
  return {
    from:
      period.from && isCalendarDate(period.from)
        ? businessDayStart(period.from)
        : period.from,
    to:
      period.to && isCalendarDate(period.to)
        ? businessDayEnd(period.to)
        : period.to,
  };
};

/**
 * One report row plus the invoice's id.
 *
 * The id rides along so the drill-down dialog can look the invoice up
 * unambiguously — invoice codes restart per branch, and this report can list
 * several branches at once. It is not a catalogue column, so neither the table
 * nor the export (both index rows by column key) ever renders it.
 */
function listingRow(columns: string[], r: InvoiceRowInput): ReportRow {
  return { ...buildInvoiceRow(columns, r), [REPORT_ROW_INVOICE_ID]: r.id };
}

/** MISA-style invoice & order listing — one row per invoice (status != cancelled). */
@Injectable()
export class InvoiceOrderListingReport implements ReportDefinition {
  readonly key = 'invoice-order-listing';

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly lineItems: Repository<InvoiceItemEntity>,
    @InjectRepository(InvoicePaymentEntity)
    private readonly payments: Repository<InvoicePaymentEntity>,
    @InjectRepository(InvoicePromotionEntity)
    private readonly promotions: Repository<InvoicePromotionEntity>,
    @InjectRepository(PaymentAccountEntity)
    private readonly paymentAccounts: Repository<PaymentAccountEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customers: Repository<CustomerEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(EmployeeProfileEntity)
    private readonly employees: Repository<EmployeeProfileEntity>,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(actor: ActorContext): Promise<ReportColumnHeader[]> {
    // desc (formula sub-labels) intentionally null in v1 — the reused keys carry
    // daily-sales formulas in INVOICE_REPORT_COLUMN_DESCS that don't apply here.
    const fixed: ReportColumnHeader[] = INVOICE_LISTING_COLUMNS.map((c) =>
      enrichHeader({
        col: c.key,
        name: INVOICE_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
        desc: null,
        type: c.type,
        group: band(c.group),
      }),
    );

    const accounts = await this.activeAccounts(actor);
    const seen = new Set<string>();
    const dynamic: ReportColumnHeader[] = [];
    for (const a of accounts) {
      if (seen.has(a.accountId)) continue;
      seen.add(a.accountId);
      dynamic.push(
        enrichHeader({
          col: dynamicColumnKey(a.accountId),
          name: a.label ?? a.paymentMethod,
          desc: null,
          type: ReportColumnDataType.CURRENCY,
          group: band('customerPayment'),
        }),
      );
    }

    // The dynamic payment-account columns belong to the `customerPayment` band.
    // Splice them in right after the last fixed `customerPayment` column so the
    // band stays one contiguous block; appending at the end would drop them
    // after the `platform` band and break the FE header colSpan grouping.
    const insertAt = fixed.reduce(
      (last, h, i) => (h.group?.id === 'customerPayment' ? i + 1 : last),
      fixed.length,
    );
    return [...fixed.slice(0, insertAt), ...dynamic, ...fixed.slice(insertAt)];
  }

  async buildData(
    dto: InvoiceReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 31;

    if (!dto.filters?.issuedAt?.from) {
      throw new BadRequestException('filters.issuedAt.from is required');
    }

    const activeAccountIds = new Set(
      (await this.activeAccounts(actor)).map((a) => a.accountId),
    );
    const referenced = [
      ...dto.columns,
      ...(dto.columnFilters ?? []).map((f) => f.col),
    ];
    const unknown = referenced.filter((k) => {
      if (isKnownListingColumn(k)) return false;
      const dyn = parseDynamicColumnKey(k);
      return !(dyn && activeAccountIds.has(dyn.accountId));
    });
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
      );
    }

    const qb = await this.scopedQuery(dto, actor);
    const invoiceRows = (await qb.getMany()).filter((i) => i.issuedAt);

    const rows = (await this.toRowInputs(invoiceRows, referenced, actor)).sort(
      (a, b) => {
        const t = a.issuedAt.getTime() - b.issuedAt.getTime();
        return t !== 0 ? t : a.code.localeCompare(b.code);
      },
    );

    const filtered = dto.columnFilters?.length
      ? rows.filter((r) =>
          dto.columnFilters!.every((f) =>
            matchColumnFilter(listingCellValue(f.col, r), f),
          ),
        )
      : rows;

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const pageRows = filtered.slice(offset, offset + limit);

    const rows2 = pageRows.map((r) => listingRow(dto.columns, r));
    const totals = filtered.length
      ? buildListingTotals(dto.columns, filtered)
      : null;

    return { rows: rows2, totals, total };
  }

  /**
   * The invoice set this report lists, as a query.
   *
   * Shared by `buildData` and the keyset export so the exported file can never
   * be scoped differently from the table it came from.
   */
  private async scopedQuery(
    dto: InvoiceReportSearchDto,
    actor: ActorContext,
  ): Promise<SelectQueryBuilder<InvoiceEntity>> {
    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      CONSOLIDATED_PERMISSION,
    );
    const branchIds = resolveBranchIds(
      hasConsolidated,
      dto.filters.store,
      dto.branchId ?? dto.filters.branchId,
      actor,
    );

    const qb = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organizationId = :orgId', { orgId: actor.organizationId });
    applyBranchScope(qb, 'invoice', branchIds);
    applyInvoiceStatusFilter(qb, 'invoice', dto.filters);
    new FilterBuilder(qb)
      .applyLocalDateRange(statDateColumn('invoice', dto.filters), dto.filters.issuedAt)
      .applyEnum('invoice.type', dto.filters.type?.value);
    return qb;
  }

  /**
   * Resolve one batch of invoices into report rows, loading only the auxiliary
   * data the requested columns actually need.
   *
   * Called with the whole period by `buildData` and with a single keyset page
   * by the export — which is the point: the `In(...)` lookups below go from
   * tens of thousands of ids to one page's worth.
   */
  private async toRowInputs(
    invoiceRows: InvoiceEntity[],
    referenced: string[],
    actor: ActorContext,
  ): Promise<InvoiceRowInput[]> {
    const invoiceIds = invoiceRows.map((i) => i.id);

    const needsPayments = referenced.some(
      (c) =>
        c === 'payment.cash' ||
        c === 'payment.bankTransfer' ||
        isDynamicColumnKey(c),
    );
    const needsVoucher = referenced.includes('payment.voucher');
    // Three columns read `discountAmount`, so any of them pulls the line sums in.
    const needsLineDiscount = referenced.some(
      (c) =>
        c === 'revenue.discount' ||
        c === 'revenue.promoRate' ||
        c === 'revenue.total',
    );
    const needsCustomer =
      referenced.includes('customer') || referenced.includes('customerPhone');
    const needsStore = referenced.includes('storeCode');
    const needsCashier = referenced.includes('cashier');
    const needsSalesperson = referenced.includes('salesperson');

    const pay = needsPayments
      ? await this.loadPayments(invoiceIds)
      : { cash: new Map(), bank: new Map(), byAccount: new Map() };
    const voucherByInvoice = needsVoucher
      ? await this.loadVouchers(invoiceIds)
      : new Map<string, number>();
    // "Khuyến mại" comes from the lines, not `invoices.discount_amount`: the
    // header only records the discount on what was sold, so an EXCHANGE whose
    // returned line reverses a promotion shows nothing there.
    const lineDiscounts = needsLineDiscount
      ? await loadSignedLineDiscounts(this.lineItems, invoiceIds)
      : new Map<string, number>();
    const customerById = needsCustomer
      ? await this.loadCustomers(invoiceRows, actor.organizationId)
      : new Map<string, CustomerEntity>();
    const storeById = needsStore
      ? await this.loadBranches(invoiceRows, actor.organizationId)
      : new Map<string, string>();
    const cashierByUser = needsCashier
      ? await this.loadEmployeesByUserId(invoiceRows, actor.organizationId)
      : new Map<string, string>();
    const salespersonById = needsSalesperson
      ? await this.loadEmployeesById(invoiceRows, actor.organizationId)
      : new Map<string, string>();

    return invoiceRows.map((i) => {
      const customer = i.customerId ? customerById.get(i.customerId) : undefined;
      // Sign each invoice row's money by type so a RETURN contributes negative
      // amounts and the footer nets; goods use the net line value (EXCHANGE = net).
      const sign = invoiceTypeSign(i.type);
      const rawByAccount: Record<string, number> = pay.byAccount.get(i.id) ?? {};
      return {
        id: i.id,
        issuedAt: i.issuedAt!,
        code: i.code,
        status: i.status,
        subtotal: signedGoods(i),
        // No `sign *` here, unlike every other field: `direction` has already
        // negated a RETURN's lines, and signing twice flips it back positive.
        discountAmount: lineDiscounts.get(i.id) ?? 0,
        pointsDiscountAmount: sign * Number(i.pointsDiscountAmount ?? 0),
        totalPaid: sign * Number(i.totalPaid ?? 0),
        amountDue: sign * Number(i.amountDue ?? 0),
        note: i.note ?? null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        cashier: cashierByUser.get(i.staffId) ?? null,
        salesperson: i.salespersonId
          ? salespersonById.get(i.salespersonId) ?? null
          : null,
        storeCode: i.branchId ? storeById.get(i.branchId) ?? null : null,
        cash: sign * (pay.cash.get(i.id) ?? 0),
        bankTransfer: sign * (pay.bank.get(i.id) ?? 0),
        voucher: sign * (voucherByInvoice.get(i.id) ?? 0),
        byAccount: Object.fromEntries(
          Object.entries(rawByAccount).map(([k, v]) => [k, sign * v]),
        ),
      };
    });
  }

  /**
   * Keyset export (ADR-07). One row per invoice, so the cursor has a real
   * record to point at — unlike the aggregate reports, which have none.
   */
  readonly exportSource: ReportExportSource<InvoiceReportSearchDto> = {
    // The table sorts oldest first; the file has to read the same way.
    order: 'asc',
    // The windows are compared against a `timestamptz`, so the picked days have
    // to be resolved to the instants that open and close them locally — a bare
    // `YYYY-MM-DD` reads as UTC midnight, which both shifts the window seven
    // hours and collapses a single-day export to its first millisecond.
    range: (dto) => toInstantRange(dto.filters?.issuedAt),
    summable: (columns) =>
      columns.filter((col) => {
        const type = listingColumnType(col);
        return (
          type === ReportColumnDataType.CURRENCY ||
          type === ReportColumnDataType.NUMBER
        );
      }),
    page: async (dto, actor, { partition, cursor, size }) => {
      const referenced = [
        ...dto.columns,
        ...(dto.columnFilters ?? []).map((f) => f.col),
      ];
      // Order and page on the same column the period filters on — the report
      // lets the user choose invoice date or created date.
      const dateColumn = statDateColumn('invoice', dto.filters);
      const rawDateColumn =
        dateColumn === 'invoice.createdAt'
          ? 'invoice.created_at'
          : 'invoice.issued_at';

      const qb = await this.scopedQuery(dto, actor);
      if (partition.from) {
        qb.andWhere(`${dateColumn} >= :partFrom`, { partFrom: partition.from });
      }
      if (partition.to) {
        // Half-open: the next window owns this instant.
        qb.andWhere(`${dateColumn} < :partTo`, { partTo: partition.to });
      }
      if (cursor) {
        qb.andWhere(
          `(${rawDateColumn} > CAST(:cursorAt AS timestamptz) OR ` +
            `(${rawDateColumn} = CAST(:cursorAt AS timestamptz) AND invoice.id > :cursorId))`,
          { cursorAt: cursor.at, cursorId: cursor.id },
        );
      }
      // `id` is the tiebreaker: without it, invoices sharing a timestamp make
      // the cursor stand still or skip the rest of that instant.
      qb.orderBy(dateColumn, 'ASC').addOrderBy('invoice.id', 'ASC').take(size);
      // Full-precision timestamptz as text. Going through a JS Date rounds off
      // microseconds, and a rounded cursor re-reads or skips rows either side.
      qb.addSelect(`${rawDateColumn}::text`, 'cursor_at');

      const { entities, raw } = await qb.getRawAndEntities<{
        cursor_at: string;
      }>();
      const dated = entities.filter((i) => i.issuedAt);
      const inputs = await this.toRowInputs(dated, referenced, actor);
      const kept = dto.columnFilters?.length
        ? inputs.filter((r) =>
            dto.columnFilters!.every((f) =>
              matchColumnFilter(listingCellValue(f.col, r), f),
            ),
          )
        : inputs;

      const lastEntity = entities[entities.length - 1];
      const lastRaw = raw[raw.length - 1];
      return {
        rows: kept.map((r) => listingRow(dto.columns, r)),
        nextCursor: lastEntity
          ? { at: lastRaw.cursor_at, id: lastEntity.id }
          : null,
        // Column filters run after the page is fetched, so paging must follow
        // what the database returned, not how much survived the filter.
        hasMore: entities.length === size,
      };
    },
  };

  private activeAccounts(actor: ActorContext): Promise<PaymentAccountEntity[]> {
    return this.paymentAccounts.find({
      where: { organizationId: actor.organizationId, isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  private async loadPayments(invoiceIds: string[]): Promise<{
    cash: Map<string, number>;
    bank: Map<string, number>;
    byAccount: Map<string, Record<string, number>>;
  }> {
    const cash = new Map<string, number>();
    const bank = new Map<string, number>();
    const byAccount = new Map<string, Record<string, number>>();
    if (!invoiceIds.length) return { cash, bank, byAccount };

    const rows = await this.payments.find({
      where: { invoiceId: In(invoiceIds) },
    });
    for (const p of rows) {
      const amount = Number(p.amount ?? 0);
      if (p.paymentMethod === InvoicePaymentMethod.CASH) {
        cash.set(p.invoiceId, (cash.get(p.invoiceId) ?? 0) + amount);
      }
      if (p.paymentMethod === InvoicePaymentMethod.BANK_TRANSFER) {
        bank.set(p.invoiceId, (bank.get(p.invoiceId) ?? 0) + amount);
      }
      const acc = byAccount.get(p.invoiceId) ?? {};
      acc[p.accountId] = (acc[p.accountId] ?? 0) + amount;
      byAccount.set(p.invoiceId, acc);
    }
    return { cash, bank, byAccount };
  }

  private async loadVouchers(invoiceIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!invoiceIds.length) return map;
    const rows = await this.promotions.find({
      where: { invoiceId: In(invoiceIds) },
    });
    for (const pr of rows) {
      if (pr.promotionType !== InvoicePromotionType.VOUCHER) continue;
      map.set(
        pr.invoiceId,
        (map.get(pr.invoiceId) ?? 0) + Number(pr.discountAmount ?? 0),
      );
    }
    return map;
  }

  private async loadCustomers(
    invoiceRows: InvoiceEntity[],
    organizationId: string,
  ): Promise<Map<string, CustomerEntity>> {
    const ids = [
      ...new Set(
        invoiceRows.map((i) => i.customerId).filter((id): id is string => !!id),
      ),
    ];
    const map = new Map<string, CustomerEntity>();
    if (!ids.length) return map;
    const rows = await this.customers.find({
      where: { id: In(ids), organizationId },
    });
    for (const c of rows) map.set(c.id, c);
    return map;
  }

  private async loadBranches(
    invoiceRows: InvoiceEntity[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        invoiceRows.map((i) => i.branchId).filter((id): id is string => !!id),
      ),
    ];
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const rows = await this.branches.find({
      where: { id: In(ids), organizationId },
    });
    for (const b of rows) map.set(b.id, b.name);
    return map;
  }

  /** Cashier: invoice.staffId references employee_profiles.user_id. */
  private async loadEmployeesByUserId(
    invoiceRows: InvoiceEntity[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(invoiceRows.map((i) => i.staffId).filter(Boolean))];
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const rows = await this.employees.find({
      where: { userId: In(ids), organizationId },
    });
    for (const e of rows) map.set(e.userId, e.code);
    return map;
  }

  /** Salesperson: invoice.salespersonId references employee_profiles.id. */
  private async loadEmployeesById(
    invoiceRows: InvoiceEntity[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        invoiceRows
          .map((i) => i.salespersonId)
          .filter((id): id is string => !!id),
      ),
    ];
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const rows = await this.employees.find({
      where: { id: In(ids), organizationId },
    });
    for (const e of rows) map.set(e.id, e.code);
    return map;
  }
}
