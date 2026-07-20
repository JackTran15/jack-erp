import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  INVOICE_REPORT_BAND_LABELS_VI,
  INVOICE_REPORT_COLUMN_DESCS,
  INVOICE_REPORT_COLUMN_LABELS_VI,
  InvoiceReportResult,
  ReportColumnDataType,
  ReportColumnGroup,
  ReportColumnHeader,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { PaymentAccountEntity } from '../../../accounting/payment-accounts/payment-account.entity';
import { PaymentAccountMethod } from '../../../accounting/payment-accounts/enums';
import { InvoiceEntity, RefundMethod } from '../../../pos/entities/invoice.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
import { InvoicePromotionEntity } from '../../../promotion/invoice-promotion.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { InvoiceReportSearchDto } from '../dto/invoice-report-search.dto';
import {
  aggregateByDay,
  buildRow,
  buildTotals,
  cellValue,
  matchColumnFilter,
  InvoiceAggInput,
  PaymentAggInput,
  PromotionAggInput,
} from '../invoice-report.aggregator';
import {
  dynamicColumnKey,
  INVOICE_REPORT_SUMMARY_COLUMNS,
  isDynamicColumnKey,
  isKnownSummaryColumn,
  parseDynamicColumnKey,
} from '../invoice-report.columns';
import { enrichHeader } from '../report-column.util';
import {
  applyBranchScope,
  applyInvoiceStatusFilter,
  CONSOLIDATED_PERMISSION,
  invoiceTypeSign,
  resolveBranchIds,
  signedGoods,
} from '../../report-core/report-query.util';
import { ReportDefinition } from '../report-definition';

const band = (id: string | null): ReportColumnGroup | null =>
  id ? { id, name: INVOICE_REPORT_BAND_LABELS_VI[id] ?? id } : null;

/** "Tổng hợp bán hàng theo ngày" — one row per day, payment methods as dynamic columns. */
@Injectable()
export class DailySalesSummaryReport implements ReportDefinition {
  readonly key = 'daily-sales-summary';

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoicePaymentEntity)
    private readonly payments: Repository<InvoicePaymentEntity>,
    @InjectRepository(InvoicePromotionEntity)
    private readonly promotions: Repository<InvoicePromotionEntity>,
    @InjectRepository(PaymentAccountEntity)
    private readonly paymentAccounts: Repository<PaymentAccountEntity>,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(actor: ActorContext): Promise<ReportColumnHeader[]> {
    const fixed: ReportColumnHeader[] = INVOICE_REPORT_SUMMARY_COLUMNS.map(
      (c) =>
        enrichHeader({
          col: c.key,
          name: INVOICE_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
          desc: INVOICE_REPORT_COLUMN_DESCS[c.key] ?? null,
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

    const accounts = await this.activeAccounts(actor);
    const activeAccountIds = new Set(accounts.map((a) => a.accountId));
    // The org's cash COA account (MISA-style single cash fund); used to net cash
    // refunds out of the cash columns. Null when no active cash account exists.
    const cashAccountId = accounts.find(
      (a) => a.paymentMethod === PaymentAccountMethod.CASH,
    )?.accountId;
    const referenced = [
      ...dto.columns,
      ...(dto.columnFilters ?? []).map((f) => f.col),
    ];
    const unknown = referenced.filter((k) => {
      if (isKnownSummaryColumn(k)) return false;
      const dyn = parseDynamicColumnKey(k);
      return !(dyn && activeAccountIds.has(dyn.accountId));
    });
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
      );
    }

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
      .applyDateRange('invoice.issuedAt', dto.filters.issuedAt)
      .applyEnum('invoice.type', dto.filters.type?.value);
    const invoiceRows = await qb.getMany();

    // Sign each invoice's contribution by type so returns/exchanges net instead
    // of inflating totals. Goods use the net line value (SALE +subtotal, RETURN
    // −subtotal, EXCHANGE newSubtotal−returnSubtotal); the header money fields and
    // payments/promotions are signed by type (RETURN negates). Signing lives here
    // (not the aggregator) so the cash-refund netting in TKT-RPT-03 composes.
    const signByInvoice = new Map<string, number>();
    const invoiceInputs: InvoiceAggInput[] = invoiceRows
      .filter((i) => i.issuedAt)
      .map((i) => {
        const sign = invoiceTypeSign(i.type);
        signByInvoice.set(i.id, sign);
        // A cash refund is captured on the header (refundedAmount + refundMethod),
        // never in invoice_payments, so net it out of actual revenue (Σ totalPaid).
        const cashRefund =
          i.refundMethod === RefundMethod.CASH ? Number(i.refundedAmount ?? 0) : 0;
        return {
          id: i.id,
          day: i.issuedAt!.toISOString().slice(0, 10),
          subtotal: signedGoods(i),
          discountAmount: sign * Number(i.discountAmount ?? 0),
          pointsDiscountAmount: sign * Number(i.pointsDiscountAmount ?? 0),
          totalPaid: sign * Number(i.totalPaid ?? 0) - cashRefund,
        };
      });

    const needsPayments = referenced.some(
      (c) => c === 'revenue.cash' || isDynamicColumnKey(c),
    );
    const needsPromotions = referenced.some((c) => c === 'payment.voucher');
    const invoiceIds = invoiceInputs.map((i) => i.id);

    const paymentInputs: PaymentAggInput[] =
      needsPayments && invoiceIds.length
        ? (
            await this.payments.find({ where: { invoiceId: In(invoiceIds) } })
          ).map((p) => ({
            invoiceId: p.invoiceId,
            paymentMethod: p.paymentMethod,
            amount: (signByInvoice.get(p.invoiceId) ?? 1) * Number(p.amount ?? 0),
            accountId: p.accountId,
          }))
        : [];
    const promotionInputs: PromotionAggInput[] =
      needsPromotions && invoiceIds.length
        ? (
            await this.promotions.find({ where: { invoiceId: In(invoiceIds) } })
          ).map((pr) => ({
            invoiceId: pr.invoiceId,
            promotionType: pr.promotionType,
            discountAmount:
              (signByInvoice.get(pr.invoiceId) ?? 1) *
              Number(pr.discountAmount ?? 0),
          }))
        : [];

    // Cash refunds live on the invoice header, not invoice_payments, so add a
    // synthetic negative cash payment per cash-refund invoice. One input nets
    // both cash columns: the method-keyed `revenue.cash` and the dynamic
    // `payment.method.<cashAccountId>`. Nets on the refund invoice's own day.
    const refundInputs: PaymentAggInput[] = needsPayments
      ? invoiceRows
          .filter(
            (i) =>
              i.issuedAt &&
              i.refundMethod === RefundMethod.CASH &&
              Number(i.refundedAmount ?? 0) > 0,
          )
          .map((i) => ({
            invoiceId: i.id,
            paymentMethod: 'cash',
            amount: -Number(i.refundedAmount ?? 0),
            // revenue.cash nets via the method key even with no active cash
            // account; the per-account column split is skipped when unresolved.
            accountId: cashAccountId ?? '',
          }))
      : [];

    const buckets = aggregateByDay(
      invoiceInputs,
      [...paymentInputs, ...refundInputs],
      promotionInputs,
    );

    let days = [...buckets.keys()].sort();
    if (dto.columnFilters?.length) {
      days = days.filter((d) =>
        dto.columnFilters!.every((f) =>
          matchColumnFilter(cellValue(f.col, buckets.get(d)!), f),
        ),
      );
    }

    const total = days.length;
    const offset = (page - 1) * limit;
    const pageDays = days.slice(offset, offset + limit);

    const rows = pageDays.map((d) => buildRow(dto.columns, buckets.get(d)!));
    const totals = days.length
      ? buildTotals(
          dto.columns,
          days.map((d) => buckets.get(d)!),
        )
      : null;

    return { rows, totals, total };
  }

  private activeAccounts(actor: ActorContext): Promise<PaymentAccountEntity[]> {
    return this.paymentAccounts.find({
      where: { organizationId: actor.organizationId, isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }
}
