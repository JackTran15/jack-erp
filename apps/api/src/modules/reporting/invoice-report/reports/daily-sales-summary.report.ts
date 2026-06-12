import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
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
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../../pos/entities/invoice.entity';
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
import { ReportDefinition } from '../report-definition';

const CONSOLIDATED_PERMISSION = 'reporting.invoice.consolidated.read';

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
      (c) => ({
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
      if (isKnownSummaryColumn(k)) return false;
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
    const invoiceRows = await qb.getMany();

    const invoiceInputs: InvoiceAggInput[] = invoiceRows
      .filter((i) => i.issuedAt)
      .map((i) => ({
        id: i.id,
        day: i.issuedAt!.toISOString().slice(0, 10),
        subtotal: Number(i.subtotal ?? 0),
        discountAmount: Number(i.discountAmount ?? 0),
        pointsDiscountAmount: Number(i.pointsDiscountAmount ?? 0),
        totalPaid: Number(i.totalPaid ?? 0),
      }));

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
            amount: Number(p.amount ?? 0),
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
            discountAmount: Number(pr.discountAmount ?? 0),
          }))
        : [];

    const buckets = aggregateByDay(invoiceInputs, paymentInputs, promotionInputs);

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

    const dataRaw = pageDays.map((d) => buildRow(dto.columns, buckets.get(d)!));
    const totals = days.length
      ? buildTotals(
          dto.columns,
          days.map((d) => buckets.get(d)!),
        )
      : null;

    return { dataRaw, totals, total, page, limit };
  }

  private activeAccounts(actor: ActorContext): Promise<PaymentAccountEntity[]> {
    return this.paymentAccounts.find({
      where: { organizationId: actor.organizationId, isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  /** Mirror of ReportingService.resolveBranchScope, gated on the invoice-report consolidated permission. */
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
