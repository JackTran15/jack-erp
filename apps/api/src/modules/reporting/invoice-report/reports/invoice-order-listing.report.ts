import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  INVOICE_REPORT_BAND_LABELS_VI,
  INVOICE_REPORT_COLUMN_LABELS_VI,
  InvoiceReportResult,
  ReportColumnDataType,
  ReportColumnGroup,
  ReportColumnHeader,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { PaymentAccountEntity } from '../../../accounting/payment-accounts/payment-account.entity';
import { BranchEntity } from '../../../branch/branch.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceStatus,
} from '../../../pos/entities/invoice.entity';
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
} from '../invoice-listing.aggregator';
import { ReportDefinition } from '../report-definition';

const CONSOLIDATED_PERMISSION = 'reporting.invoice.consolidated.read';

const band = (id: ListingBandId | null): ReportColumnGroup | null =>
  id ? { id, name: INVOICE_REPORT_BAND_LABELS_VI[id] ?? id } : null;

/** MISA-style invoice & order listing — one row per invoice (status != cancelled). */
@Injectable()
export class InvoiceOrderListingReport implements ReportDefinition {
  readonly key = 'invoice-order-listing';

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
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
    const fixed: ReportColumnHeader[] = INVOICE_LISTING_COLUMNS.map((c) => ({
      col: c.key,
      name: INVOICE_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
      desc: null,
      type: c.type,
      group: band(c.group),
    }));

    const accounts = await this.activeAccounts(actor);
    const seen = new Set<string>();
    const dynamic: ReportColumnHeader[] = [];
    for (const a of accounts) {
      if (seen.has(a.accountId)) continue;
      seen.add(a.accountId);
      dynamic.push({
        col: dynamicColumnKey(a.accountId),
        name: a.label ?? a.paymentMethod,
        desc: null,
        type: ReportColumnDataType.CURRENCY,
        group: band('customerPayment'),
      });
    }

    return [...fixed, ...dynamic];
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

    const branchId = await this.resolveBranchScope(
      dto.branchId ?? dto.filters.branchId,
      actor,
    );

    const qb = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('invoice.status != :cancelled', {
        cancelled: InvoiceStatus.CANCELLED,
      });
    if (branchId) {
      qb.andWhere('invoice.branchId = :branchId', { branchId });
    }
    new FilterBuilder(qb)
      .applyDateRange('invoice.issuedAt', dto.filters.issuedAt)
      .applyEnum('invoice.status', dto.filters.status?.value)
      .applyEnum('invoice.type', dto.filters.type?.value);
    const invoiceRows = (await qb.getMany()).filter((i) => i.issuedAt);
    const invoiceIds = invoiceRows.map((i) => i.id);

    // Fetch only the auxiliary data the requested columns actually need.
    const needsPayments = referenced.some(
      (c) =>
        c === 'payment.cash' ||
        c === 'payment.bankTransfer' ||
        isDynamicColumnKey(c),
    );
    const needsVoucher = referenced.includes('payment.voucher');
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

    const rows: InvoiceRowInput[] = invoiceRows
      .map((i) => {
        const customer = i.customerId ? customerById.get(i.customerId) : undefined;
        return {
          id: i.id,
          issuedAt: i.issuedAt!,
          code: i.code,
          status: i.status,
          subtotal: Number(i.subtotal ?? 0),
          discountAmount: Number(i.discountAmount ?? 0),
          pointsDiscountAmount: Number(i.pointsDiscountAmount ?? 0),
          totalPaid: Number(i.totalPaid ?? 0),
          amountDue: Number(i.amountDue ?? 0),
          note: i.note ?? null,
          customerName: customer?.name ?? null,
          customerPhone: customer?.phone ?? null,
          cashier: cashierByUser.get(i.staffId) ?? null,
          salesperson: i.salespersonId
            ? salespersonById.get(i.salespersonId) ?? null
            : null,
          storeCode: i.branchId ? storeById.get(i.branchId) ?? null : null,
          cash: pay.cash.get(i.id) ?? 0,
          bankTransfer: pay.bank.get(i.id) ?? 0,
          voucher: voucherByInvoice.get(i.id) ?? 0,
          byAccount: pay.byAccount.get(i.id) ?? {},
        };
      })
      .sort((a, b) => {
        const t = a.issuedAt.getTime() - b.issuedAt.getTime();
        return t !== 0 ? t : a.code.localeCompare(b.code);
      });

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

    const dataRaw = pageRows.map((r) => buildInvoiceRow(dto.columns, r));
    const totals = filtered.length
      ? buildListingTotals(dto.columns, filtered)
      : null;

    return { dataRaw, totals, total, page, limit };
  }

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

  /** Mirror of DailySalesSummaryReport.resolveBranchScope (gated on the consolidated permission). */
  private async resolveBranchScope(
    requestedBranchId: string | undefined,
    actor: ActorContext,
  ): Promise<string | null> {
    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      CONSOLIDATED_PERMISSION,
    );
    if (requestedBranchId) {
      if (hasConsolidated) return requestedBranchId;
      if (actor.branchId && actor.branchId === requestedBranchId) {
        return requestedBranchId;
      }
      throw new ForbiddenException(
        `Access denied for branch: ${requestedBranchId}`,
      );
    }
    if (hasConsolidated) return null;
    if (!actor.branchId) {
      throw new ForbiddenException(
        'No branch scope available and consolidated access not granted',
      );
    }
    return actor.branchId;
  }
}
