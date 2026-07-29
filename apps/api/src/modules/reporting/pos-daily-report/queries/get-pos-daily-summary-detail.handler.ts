import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  PosDailySummaryDetailCategory,
  PosDailySummaryDetailResult,
  PosDailySummaryDetailRow,
  ReportCellValue,
} from '@erp/shared-interfaces';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceType,
  RefundMethod,
} from '../../../pos/entities/invoice.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
import { InvoiceDebtEntity, DebtDocumentType } from '../../../pos/entities/invoice-debt.entity';
import { DebtPaymentEntity } from '../../../pos/entities/debt-payment.entity';
import { CashPaymentEntity } from '../../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashReceiptEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { CashReceiptPurpose, CashVoucherStatus } from '../../../accounting/cash-vouchers/enums';
import { PaymentAccountEntity } from '../../../accounting/payment-accounts/payment-account.entity';
import { PaymentAccountMethod } from '../../../accounting/payment-accounts/enums';
import { CashAccountEntity } from '../../../accounting/cash/cash-account.entity';
import { DepositAccountEntity } from '../../../accounting/deposit/deposit-account.entity';
import { AccountEntity } from '../../../accounting/coa/account.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { RbacService } from '../../../rbac/rbac.service';
import {
  applyBranchScope,
  applyInvoiceStatusFilter,
  CONSOLIDATED_PERMISSION,
  invoiceTypeSign,
  resolveBranchIds,
} from '../../report-core/report-query.util';
import { GetPosDailySummaryDetailQuery } from './get-pos-daily-summary-detail.query';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const dateOnly = (iso?: string): string | undefined => (iso ? iso.slice(0, 10) : undefined);
const toIso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : d);

/** Vietnamese label for an invoice's type — same 3 labels used in Tab 1's "Khác" section. */
function invoiceTypeLabel(type: InvoiceType): string {
  if (type === InvoiceType.RETURN) return 'Đổi trả';
  if (type === InvoiceType.EXCHANGE) return 'Đổi trả, mua thêm';
  return 'Bán hàng';
}

/** Everything a per-category row builder needs — resolved once in `execute()`. */
interface DetailBuildContext {
  org: string;
  branchIds: string[] | null;
  accountMethod: Map<string, PaymentAccountMethod>;
  from?: string;
  to?: string;
  voucherStaffIds: string[];
  issuedAt: { from?: string; to?: string };
  cashierId?: string;
  salespersonId?: string;
  invoiceStatus?: string[];
}

/**
 * A source row before customer/account display names are resolved. Only one
 * of {@link customerId}/{@link customerNameDirect} and one of
 * {@link depositAccountId}/{@link glAccountId}/{@link cashAccountId} is ever set,
 * depending on which entity the row came from.
 */
interface SourceRow {
  documentNumber: string;
  documentType?: string;
  sortKey: string;
  customerId?: string;
  /** Row is invoice/debt-sourced — render "Khách lẻ" when `customerId` is unset, rather than leaving the cell blank. */
  showCustomerFallback?: boolean;
  customerNameDirect?: string;
  depositAccountId?: string;
  glAccountId?: string;
  cashAccountId?: string;
  amount?: number;
  pointsUsed?: number;
  pointsValue?: number;
}

function cellValue(col: string, row: PosDailySummaryDetailRow): ReportCellValue {
  const value = (row as unknown as Record<string, ReportCellValue | undefined>)[col];
  return value === undefined ? null : value;
}

/**
 * Drill-down ("xem chi tiết") row list backing one Tab 1 summary line item.
 * Each category's row set is built to sum exactly to the matching field on
 * `GetPosDailySummaryHandler`'s result — see that handler's money-model doc
 * comment for the shared Thu/Chi/Công nợ definitions this mirrors.
 */
@QueryHandler(GetPosDailySummaryDetailQuery)
export class GetPosDailySummaryDetailHandler
  implements IQueryHandler<GetPosDailySummaryDetailQuery>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoicePaymentEntity)
    private readonly payments: Repository<InvoicePaymentEntity>,
    @InjectRepository(InvoiceDebtEntity)
    private readonly invoiceDebts: Repository<InvoiceDebtEntity>,
    @InjectRepository(DebtPaymentEntity)
    private readonly debtPayments: Repository<DebtPaymentEntity>,
    @InjectRepository(CashPaymentEntity)
    private readonly cashPayments: Repository<CashPaymentEntity>,
    @InjectRepository(CashReceiptEntity)
    private readonly cashReceipts: Repository<CashReceiptEntity>,
    @InjectRepository(PaymentAccountEntity)
    private readonly paymentAccounts: Repository<PaymentAccountEntity>,
    @InjectRepository(CashAccountEntity)
    private readonly cashAccounts: Repository<CashAccountEntity>,
    @InjectRepository(DepositAccountEntity)
    private readonly depositAccounts: Repository<DepositAccountEntity>,
    @InjectRepository(AccountEntity)
    private readonly glAccounts: Repository<AccountEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customers: Repository<CustomerEntity>,
    private readonly rbac: RbacService,
  ) {}

  async execute({
    dto,
    actor,
  }: GetPosDailySummaryDetailQuery): Promise<PosDailySummaryDetailResult> {
    const org = actor.organizationId;
    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      org,
      CONSOLIDATED_PERMISSION,
    );
    const branchIds = resolveBranchIds(
      hasConsolidated,
      undefined,
      dto.branchId ?? actor.branchId,
      actor,
    );

    const accountMethod = new Map<string, PaymentAccountMethod>();
    const accounts = await this.paymentAccounts.find({ where: { organizationId: org } });
    for (const a of accounts) accountMethod.set(a.accountId, a.paymentMethod);

    const ctx: DetailBuildContext = {
      org,
      branchIds,
      accountMethod,
      from: dateOnly(dto.issuedAt?.from),
      to: dateOnly(dto.issuedAt?.to),
      voucherStaffIds: [dto.cashierId, dto.salespersonId].filter(
        (id): id is string => Boolean(id),
      ),
      issuedAt: dto.issuedAt,
      cashierId: dto.cashierId,
      salespersonId: dto.salespersonId,
      invoiceStatus: dto.invoiceStatus,
    };

    const rows = await this.buildSourceRows(dto.category, ctx);
    const resolved = await this.resolveDisplayFields(org, rows);
    resolved.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0));

    const filtered = dto.columnFilters?.length
      ? resolved.filter((row) =>
          dto.columnFilters!.every((f) => matchColumnFilter(cellValue(f.col, row), f)),
        )
      : resolved;

    const totals = filtered.reduce(
      (acc, row) => {
        acc.amount += row.amount ?? 0;
        acc.pointsUsed += row.pointsUsed ?? 0;
        acc.pointsValue += row.pointsValue ?? 0;
        return acc;
      },
      { amount: 0, pointsUsed: 0, pointsValue: 0 },
    );
    totals.amount = round2(totals.amount);
    totals.pointsValue = round2(totals.pointsValue);

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const start = (page - 1) * limit;
    return { rows: filtered.slice(start, start + limit), total: filtered.length, totals };
  }

  private async buildSourceRows(
    category: PosDailySummaryDetailCategory,
    ctx: DetailBuildContext,
  ): Promise<SourceRow[]> {
    switch (category) {
      case PosDailySummaryDetailCategory.RevenueCash:
        return this.buildRevenueRows(ctx, InvoicePaymentMethod.CASH, PaymentAccountMethod.CASH);
      case PosDailySummaryDetailCategory.RevenueBankTransfer:
        return this.buildRevenueRows(
          ctx,
          InvoicePaymentMethod.BANK_TRANSFER,
          PaymentAccountMethod.BANK_TRANSFER,
        );
      case PosDailySummaryDetailCategory.RevenuePoints:
        return this.buildRevenuePointsRows(ctx);
      case PosDailySummaryDetailCategory.ExpenseCash:
        return this.buildExpenseRows(ctx, PaymentAccountMethod.CASH);
      case PosDailySummaryDetailCategory.ExpenseBankTransfer:
        return this.buildExpenseRows(ctx, PaymentAccountMethod.BANK_TRANSFER);
      case PosDailySummaryDetailCategory.DebtIncrease:
        return this.buildDebtIncreaseRows(ctx);
      case PosDailySummaryDetailCategory.DebtDecrease:
        return this.buildDebtDecreaseRows(ctx);
      default:
        return [];
    }
  }

  /** Shared invoice fetch for the 3 revenue categories (Tiền mặt / Chuyển khoản / Điểm). */
  private async fetchWindowInvoices(ctx: DetailBuildContext): Promise<InvoiceEntity[]> {
    const qb = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organizationId = :org', { org: ctx.org });
    applyBranchScope(qb, 'invoice', ctx.branchIds);
    applyInvoiceStatusFilter(qb, 'invoice', { invoiceStatus: ctx.invoiceStatus });
    new FilterBuilder(qb).applyDateRange('invoice.issuedAt', ctx.issuedAt);
    if (ctx.cashierId) qb.andWhere('invoice.staffId = :cashier', { cashier: ctx.cashierId });
    if (ctx.salespersonId) qb.andWhere('invoice.salespersonId = :sp', { sp: ctx.salespersonId });
    return qb.getMany();
  }

  private async buildRevenueRows(
    ctx: DetailBuildContext,
    method: InvoicePaymentMethod,
    accountMethodBucket: PaymentAccountMethod,
  ): Promise<SourceRow[]> {
    const rows: SourceRow[] = [];
    const invoices = await this.fetchWindowInvoices(ctx);
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const invoiceIds = invoices.map((i) => i.id);

    if (invoiceIds.length) {
      const paymentRows = await this.payments.find({
        where: { invoiceId: In(invoiceIds), paymentMethod: method },
      });
      for (const p of paymentRows) {
        const inv = invoiceById.get(p.invoiceId);
        if (!inv) continue;
        const sign = invoiceTypeSign(inv.type);
        rows.push({
          documentNumber: inv.code,
          documentType: invoiceTypeLabel(inv.type),
          sortKey: toIso(inv.issuedAt ?? inv.createdAt),
          customerId: inv.customerId,
          showCustomerFallback: true,
          depositAccountId: p.depositAccountId,
          glAccountId: p.accountId,
          amount: sign * Number(p.amount ?? 0),
        });
      }
    }

    // Cash-method refund netting mirrors the aggregate handler: a CASH refund is
    // never an invoice_payments row, so it's represented here as its own negative
    // line so the drill-down total still reconciles with revenue.cash.
    if (method === InvoicePaymentMethod.CASH) {
      for (const inv of invoices) {
        if (inv.refundMethod === RefundMethod.CASH && Number(inv.refundedAmount ?? 0) > 0) {
          rows.push({
            documentNumber: inv.code,
            documentType: 'Hoàn tiền mặt',
            sortKey: toIso(inv.issuedAt ?? inv.createdAt),
            customerId: inv.customerId,
            showCustomerFallback: true,
            amount: -Number(inv.refundedAmount ?? 0),
          });
        }
      }
    }

    // Non-invoice cash inflow (Thu nợ / Thu khác) — see aggregate handler's doc
    // comment for why POS_SALE-purpose receipts are excluded.
    const receiptQb = this.cashReceipts
      .createQueryBuilder('r')
      .where('r.organizationId = :org', { org: ctx.org })
      .andWhere('r.status = :posted', { posted: CashVoucherStatus.POSTED })
      .andWhere('r.purpose != :posSale', { posSale: CashReceiptPurpose.POS_SALE });
    applyBranchScope(receiptQb, 'r', ctx.branchIds);
    if (ctx.from) receiptQb.andWhere('r.voucherDate >= :crFrom', { crFrom: ctx.from });
    if (ctx.to) receiptQb.andWhere('r.voucherDate <= :crTo', { crTo: ctx.to });
    if (ctx.voucherStaffIds.length) {
      receiptQb.andWhere('r.staffId IN (:...voucherStaffIds)', {
        voucherStaffIds: ctx.voucherStaffIds,
      });
    }
    const receiptRows = await receiptQb.getMany();
    for (const r of receiptRows) {
      const rowMethod = ctx.accountMethod.get(r.cashAccountId);
      const bucket =
        rowMethod === PaymentAccountMethod.BANK_TRANSFER
          ? PaymentAccountMethod.BANK_TRANSFER
          : PaymentAccountMethod.CASH;
      if (bucket !== accountMethodBucket) continue;
      rows.push({
        documentNumber: r.documentNumber ?? r.id,
        documentType: r.purpose === CashReceiptPurpose.DEBT_COLLECTION ? 'Thu nợ' : 'Thu khác',
        sortKey: `${r.voucherDate}T00:00:00.000Z`,
        customerNameDirect: r.payerName ?? undefined,
        cashAccountId: r.cashAccountId,
        amount: Number(r.totalAmount ?? 0),
      });
    }

    return rows;
  }

  private async buildRevenuePointsRows(ctx: DetailBuildContext): Promise<SourceRow[]> {
    const invoices = await this.fetchWindowInvoices(ctx);
    const rows: SourceRow[] = [];
    for (const inv of invoices) {
      const discount = Number(inv.pointsDiscountAmount ?? 0);
      if (!discount && !inv.pointsRedeemed) continue;
      const sign = invoiceTypeSign(inv.type);
      rows.push({
        documentNumber: inv.code,
        documentType: invoiceTypeLabel(inv.type),
        sortKey: toIso(inv.issuedAt ?? inv.createdAt),
        customerId: inv.customerId,
        showCustomerFallback: true,
        pointsUsed: sign * Number(inv.pointsRedeemed ?? 0),
        pointsValue: round2(sign * discount),
      });
    }
    return rows;
  }

  private async buildExpenseRows(
    ctx: DetailBuildContext,
    accountMethodBucket: PaymentAccountMethod,
  ): Promise<SourceRow[]> {
    const qb = this.cashPayments
      .createQueryBuilder('p')
      .where('p.organizationId = :org', { org: ctx.org })
      .andWhere('p.status = :posted', { posted: CashVoucherStatus.POSTED });
    applyBranchScope(qb, 'p', ctx.branchIds);
    if (ctx.from) qb.andWhere('p.voucherDate >= :cpFrom', { cpFrom: ctx.from });
    if (ctx.to) qb.andWhere('p.voucherDate <= :cpTo', { cpTo: ctx.to });
    if (ctx.voucherStaffIds.length) {
      qb.andWhere('p.staffId IN (:...voucherStaffIds)', { voucherStaffIds: ctx.voucherStaffIds });
    }
    const cashRows = await qb.getMany();
    const rows: SourceRow[] = [];
    for (const p of cashRows) {
      // Unmapped funds default to cash, mirroring the aggregate handler.
      const method = ctx.accountMethod.get(p.cashAccountId);
      const bucket =
        method === PaymentAccountMethod.BANK_TRANSFER
          ? PaymentAccountMethod.BANK_TRANSFER
          : PaymentAccountMethod.CASH;
      if (bucket !== accountMethodBucket) continue;
      rows.push({
        documentNumber: p.documentNumber ?? p.id,
        sortKey: `${p.voucherDate}T00:00:00.000Z`,
        customerNameDirect: p.payeeName ?? undefined,
        cashAccountId: p.cashAccountId,
        amount: Number(p.totalAmount ?? 0),
      });
    }
    return rows;
  }

  private async buildDebtIncreaseRows(ctx: DetailBuildContext): Promise<SourceRow[]> {
    const qb = this.invoiceDebts
      .createQueryBuilder('d')
      .where('d.organizationId = :org', { org: ctx.org })
      .andWhere('d.documentType = :creditType', { creditType: DebtDocumentType.CREDIT_INVOICE });
    applyBranchScope(qb, 'd', ctx.branchIds);
    if (ctx.from) qb.andWhere('d.issuedAt >= :dFrom', { dFrom: ctx.from });
    if (ctx.to) qb.andWhere('d.issuedAt <= :dTo', { dTo: ctx.to });
    if (ctx.cashierId || ctx.salespersonId) {
      qb.innerJoin(InvoiceEntity, 'debtInvoice', 'debtInvoice.id = d.invoiceId');
      if (ctx.cashierId) qb.andWhere('debtInvoice.staffId = :cashier', { cashier: ctx.cashierId });
      if (ctx.salespersonId) {
        qb.andWhere('debtInvoice.salespersonId = :sp', { sp: ctx.salespersonId });
      }
    }
    const debtRows = await qb.getMany();
    if (!debtRows.length) return [];

    const invoices = await this.invoices.find({
      where: { id: In(debtRows.map((d) => d.invoiceId)) },
    });
    const typeByInvoice = new Map(invoices.map((i) => [i.id, i.type]));

    return debtRows.map((d) => ({
      documentNumber: d.referenceCode,
      documentType: invoiceTypeLabel(typeByInvoice.get(d.invoiceId) ?? InvoiceType.SALE),
      sortKey: `${d.issuedAt}T00:00:00.000Z`,
      customerId: d.customerId,
      showCustomerFallback: true,
      amount: Number(d.originalAmount ?? 0),
    }));
  }

  private async buildDebtDecreaseRows(ctx: DetailBuildContext): Promise<SourceRow[]> {
    const qb = this.debtPayments
      .createQueryBuilder('dp')
      .where('dp.organizationId = :org', { org: ctx.org });
    applyBranchScope(qb, 'dp', ctx.branchIds);
    new FilterBuilder(qb).applyDateRange('dp.paidAt', ctx.issuedAt);
    const repayRows = await qb.getMany();
    if (!repayRows.length) return [];

    // Batch-resolve the owning debt (→ customerId, invoiceId) rather than joining
    // in SQL — keeps the cashier/salesperson narrow (which needs the invoice, one
    // hop further) a plain in-memory filter instead of a fragile raw-column join.
    const debtIds = [...new Set(repayRows.map((r) => r.debtId))];
    const debts = await this.invoiceDebts.find({ where: { id: In(debtIds) } });
    const debtById = new Map(debts.map((d) => [d.id, d]));

    const invoiceIds = [...new Set(debts.map((d) => d.invoiceId))];
    const invoices = invoiceIds.length
      ? await this.invoices.find({ where: { id: In(invoiceIds) } })
      : [];
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));

    const receiptIds = repayRows
      .map((r) => r.cashReceiptId)
      .filter((id): id is string => Boolean(id));
    const receipts = receiptIds.length
      ? await this.cashReceipts.find({ where: { id: In(receiptIds) } })
      : [];
    const receiptById = new Map(receipts.map((r) => [r.id, r]));

    const rows: SourceRow[] = [];
    for (const r of repayRows) {
      const debt = debtById.get(r.debtId);
      if (!debt) continue;
      const invoice = invoiceById.get(debt.invoiceId);
      if (ctx.cashierId && invoice?.staffId !== ctx.cashierId) continue;
      if (ctx.salespersonId && invoice?.salespersonId !== ctx.salespersonId) continue;
      rows.push({
        documentNumber:
          (r.cashReceiptId && receiptById.get(r.cashReceiptId)?.documentNumber) || r.id,
        documentType: invoiceTypeLabel(invoice?.type ?? InvoiceType.SALE),
        sortKey: toIso(r.paidAt),
        customerId: debt.customerId,
        showCustomerFallback: true,
        amount: Number(r.amount ?? 0),
      });
    }
    return rows;
  }

  private async resolveDisplayFields(
    org: string,
    rows: SourceRow[],
  ): Promise<PosDailySummaryDetailRow[]> {
    const customerIds = [
      ...new Set(rows.map((r) => r.customerId).filter((id): id is string => Boolean(id))),
    ];
    const depositAccountIds = [
      ...new Set(rows.map((r) => r.depositAccountId).filter((id): id is string => Boolean(id))),
    ];
    const glAccountIds = [
      ...new Set(rows.map((r) => r.glAccountId).filter((id): id is string => Boolean(id))),
    ];
    const cashAccountIds = [
      ...new Set(rows.map((r) => r.cashAccountId).filter((id): id is string => Boolean(id))),
    ];

    const [customers, depositAccounts, glAccounts, cashAccounts] = await Promise.all([
      customerIds.length
        ? this.customers.find({ where: { id: In(customerIds), organizationId: org } })
        : Promise.resolve([]),
      depositAccountIds.length
        ? this.depositAccounts.find({ where: { id: In(depositAccountIds), organizationId: org } })
        : Promise.resolve([]),
      glAccountIds.length
        ? this.glAccounts.find({ where: { id: In(glAccountIds), organizationId: org } })
        : Promise.resolve([]),
      cashAccountIds.length
        ? this.cashAccounts.find({ where: { id: In(cashAccountIds), organizationId: org } })
        : Promise.resolve([]),
    ]);
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const depositById = new Map(depositAccounts.map((a) => [a.id, a]));
    const glById = new Map(glAccounts.map((a) => [a.id, a]));
    const cashAccountById = new Map(cashAccounts.map((a) => [a.id, a]));

    return rows.map((r) => {
      const customerName =
        r.customerNameDirect ??
        (r.showCustomerFallback
          ? (r.customerId && customerById.get(r.customerId)?.name) || 'Khách lẻ'
          : undefined);
      const bankAccountName = r.depositAccountId
        ? depositById.get(r.depositAccountId)?.name
        : r.glAccountId
          ? glById.get(r.glAccountId)?.name
          : r.cashAccountId
            ? cashAccountById.get(r.cashAccountId)?.name
            : undefined;
      return {
        documentNumber: r.documentNumber,
        documentType: r.documentType,
        issuedAt: r.sortKey,
        customerName,
        bankAccountName,
        amount: r.amount !== undefined ? round2(r.amount) : undefined,
        pointsUsed: r.pointsUsed,
        pointsValue: r.pointsValue,
      };
    });
  }
}
