import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PROFIT_REPORT_COLUMN_LABELS_VI, PROFIT_REPORT_COLUMN_DESCS, InvoiceReportResult, ReportColumnHeader } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { ItemDirection } from '../../../pos/entities/invoice-item.entity';
import { InvoiceItemEntity } from '../../../pos/entities/invoice-item.entity';
import { InvoiceEntity } from '../../../pos/entities/invoice.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import {
  applyBranchScope,
  applyInvoiceStatusFilter,
  CONSOLIDATED_PERMISSION,
  invoiceTypeSign,
  resolveBranchIds,
  signedGoods,
} from '../../report-core/report-query.util';
import { ProfitReportSearchDto } from '../dto/profit-report-search.dto';
import {
  aggregateGrossProfitByDay,
  buildRow,
  buildTotals,
  cellValue,
  InvoiceDayInput,
  LineCostInput,
} from '../gross-profit-by-invoice.aggregator';
import {
  GROSS_PROFIT_BY_INVOICE_COLUMNS,
  isKnownGrossProfitByInvoiceColumn,
} from '../gross-profit-by-invoice.columns';
import { enrichHeader } from '../report-column.util';
import { ReportDefinition } from '../report-definition';

/**
 * "Báo cáo lợi nhuận gộp theo hoá đơn" — one row PER DAY in the selected
 * period (verified against the reference UI: the "theo hoá đơn" in the name
 * describes the calculation basis — invoice + line-item data — not the
 * display grain). Song sinh với DailySalesSummaryReport, cộng thêm giá vốn
 * theo dòng hàng để ra lợi nhuận gộp.
 */
@Injectable()
export class GrossProfitByInvoiceReport implements ReportDefinition {
  readonly key = 'gross-profit-by-invoice';

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly lineItems: Repository<InvoiceItemEntity>,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(_actor: ActorContext): Promise<ReportColumnHeader[]> {
    return GROSS_PROFIT_BY_INVOICE_COLUMNS.map((c) =>
      enrichHeader({
        col: c.key,
        name: PROFIT_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
        desc: PROFIT_REPORT_COLUMN_DESCS[c.key] ?? null,
        type: c.type,
        group: null,
      }),
    );
  }

  async buildData(
    dto: ProfitReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 31;

    if (!dto.filters?.issuedAt?.from) {
      throw new BadRequestException('filters.issuedAt.from is required');
    }

    const referenced = [
      ...dto.columns,
      ...(dto.columnFilters ?? []).map((f) => f.col),
    ];
    const unknown = referenced.filter((k) => !isKnownGrossProfitByInvoiceColumn(k));
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
      dto.filters.branchId,
      actor,
    );

    const qb = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organizationId = :orgId', { orgId: actor.organizationId });
    applyBranchScope(qb, 'invoice', branchIds);
    applyInvoiceStatusFilter(qb, 'invoice', {});
    new FilterBuilder(qb).applyDateRange('invoice.issuedAt', dto.filters.issuedAt);
    const invoiceRows = (await qb.getMany()).filter((i) => i.issuedAt);
    const invoiceIds = invoiceRows.map((i) => i.id);

    // grossGoods/discount now need line-level data too (see below), not just
    // costOfGoods/grossProfit — fetch lines whenever any money column beyond
    // "date" is requested.
    const needsLines = referenced.some((c) =>
      ['grossGoods', 'discount', 'revenue', 'costOfGoods', 'grossProfit'].includes(c),
    );
    const lines = needsLines && invoiceIds.length
      ? await this.lineItems.find({ where: { invoiceId: In(invoiceIds) } })
      : [];

    // Per-invoice line-level contributions, signed by LINE direction (not
    // invoice.type) — required for EXCHANGE invoices, which carry both an OUT
    // (new items) and an IN (returned items) leg in the SAME invoice.
    const lineContribByInvoiceId = new Map<string, { gross: number; discount: number }>();
    for (const li of lines) {
      const sign = li.direction === ItemDirection.IN ? -1 : 1;
      const cur = lineContribByInvoiceId.get(li.invoiceId) ?? { gross: 0, discount: 0 };
      cur.gross += sign * Number(li.quantity ?? 0) * Number(li.unitPrice ?? 0);
      cur.discount += sign * Number(li.lineDiscount ?? 0);
      lineContribByInvoiceId.set(li.invoiceId, cur);
    }

    const invoiceInputs: InvoiceDayInput[] = invoiceRows.map((i) => {
      const sign = invoiceTypeSign(i.type);
      const contrib = lineContribByInvoiceId.get(i.id) ?? { gross: 0, discount: 0 };
      const headerDiscount =
        sign * (Number(i.discountAmount ?? 0) + Number(i.pointsDiscountAmount ?? 0));
      return {
        id: i.id,
        day: i.issuedAt!.toISOString().slice(0, 10),
        // "Tổng tiền hàng" — TRUE gross (Σ quantity×unitPrice), before ANY
        // discount, so per-line promotions land in "Giảm giá" (2) instead of
        // silently vanishing into a pre-netted subtotal. Falls back to
        // signedGoods(invoice) (invoice.subtotal/netAmount, already net of
        // lineDiscount) only when lines weren't fetched, so the column still
        // renders something sane if a caller only asked for grossGoods
        // without discount/costOfGoods/etc.
        grossGoods: needsLines ? contrib.gross : signedGoods(i),
        // "Giảm giá" — header-level (voucher/discount-code/promotion/points)
        // + per-line ("KM ...") discount. Both pools are real promotional
        // spend; per-line promos only ever hit invoice_items.lineDiscount,
        // never invoice.discountAmount (mirrors business-results 2.1.3).
        discount: headerDiscount + contrib.discount,
      };
    });

    const lineCosts: LineCostInput[] = lines.map((li) => ({
      invoiceId: li.invoiceId,
      costOfGoods:
        (li.direction === ItemDirection.IN ? -1 : 1) *
        Number(li.quantity ?? 0) *
        Number(li.costPrice ?? 0),
    }));

    const buckets = aggregateGrossProfitByDay(invoiceInputs, lineCosts);

    let days = [...buckets.keys()].sort();
    if (dto.columnFilters?.length) {
      days = days.filter((d) =>
        dto.columnFilters!.every((f) => matchColumnFilter(cellValue(f.col, buckets.get(d)!), f)),
      );
    }

    const total = days.length;
    const offset = (page - 1) * limit;
    const pageDays = days.slice(offset, offset + limit);

    const rows = pageDays.map((d) => buildRow(dto.columns, buckets.get(d)!));
    const totals = days.length
      ? buildTotals(dto.columns, days.map((d) => buckets.get(d)!))
      : null;

    return { rows, totals, total };
  }
}
