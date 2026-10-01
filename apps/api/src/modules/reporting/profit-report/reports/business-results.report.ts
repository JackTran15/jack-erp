import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PROFIT_REPORT_COLUMN_LABELS_VI,
  InvoiceReportResult,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashVoucherCategoryEntity } from '../../../accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.entity';
import { CashVoucherCategoryDirection } from '../../../accounting/cash-vouchers/enums';
import { ItemDirection } from '../../../pos/entities/invoice-item.entity';
import { InvoiceType } from '../../../pos/entities/invoice.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { PROFIT_CONSOLIDATED, resolveReportBranchIds } from '../../report-core/report-query.util';
import {
  BusinessResultsRawValues,
  buildBusinessResultsRows,
  OtherLineCategory,
} from '../business-results.aggregator';
import { BUSINESS_RESULTS_COLUMNS, isKnownBusinessResultsColumn } from '../business-results.columns';
import {
  BusinessResultsScope,
  BusinessResultsSource,
  OtherLineDirection,
  VOUCHER_KINDS_BY_DIRECTION,
} from '../business-results.source';
import { ProfitReportSearchDto } from '../dto/profit-report-search.dto';
import { enrichHeader } from '../report-column.util';
import { ReportDefinition } from '../report-definition';

type OtherLines = { byCategory: Record<string, number>; uncategorized: number };

/**
 * "Kết quả kinh doanh" — fixed P&L statement (2.2 "Thu khác" and 3.2 "Chi phí
 * khác" both have DYNAMIC children — one row per cash-voucher category of the
 * matching direction + 1 uncategorized row), computed twice (previous
 * period, current period) and merged into a change-comparison table. Unlike
 * `profit-by-item`/`gross-profit-by-invoice`, rows are NOT DB entities — they
 * are a catalog of line items (see business-results.aggregator.ts).
 *
 * Every figure is summed over a row set from `BusinessResultsSource`, which the
 * drill-down detail reports list from too.
 */
@Injectable()
export class BusinessResultsReport implements ReportDefinition {
  readonly key = 'business-results';

  constructor(
    private readonly source: BusinessResultsSource,
    @InjectRepository(CashVoucherCategoryEntity)
    private readonly cashVoucherCategories: Repository<CashVoucherCategoryEntity>,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(_actor: ActorContext): Promise<ReportColumnHeader[]> {
    return BUSINESS_RESULTS_COLUMNS.map((c) =>
      enrichHeader({
        col: c.key,
        name: PROFIT_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
        desc: null,
        type: c.type,
        group: null,
      }),
    );
  }

  async buildData(
    dto: ProfitReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const previous = dto.filters?.previousPeriod;
    const current = dto.filters?.currentPeriod;
    if (!previous?.from || !previous?.to) {
      throw new BadRequestException('filters.previousPeriod is required');
    }
    if (!current?.from || !current?.to) {
      throw new BadRequestException('filters.currentPeriod is required');
    }

    const unknown = dto.columns.filter((k) => !isKnownBusinessResultsColumn(k));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
      );
    }

    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      PROFIT_CONSOLIDATED,
    );
    const branchIds = resolveReportBranchIds(
      hasConsolidated,
      dto.filters.store,
      dto.filters.branchId,
      actor,
    );
    const scope = (period: { from: string; to: string }): BusinessResultsScope => ({
      organizationId: actor.organizationId,
      branchIds,
      from: period.from,
      to: period.to,
    });

    const [incomeCategories, expenseCategories, previousRaw, currentRaw] = await Promise.all([
      this.queryOtherCategories(actor.organizationId, CashVoucherCategoryDirection.IN),
      this.queryOtherCategories(actor.organizationId, CashVoucherCategoryDirection.OUT),
      this.queryPeriodRawValues(scope({ from: previous.from, to: previous.to })),
      this.queryPeriodRawValues(scope({ from: current.from, to: current.to })),
    ]);

    const rows = buildBusinessResultsRows(previousRaw, currentRaw, incomeCategories, expenseCategories);

    return {
      rows: rows as unknown as ReportRow[],
      totals: null,
      total: rows.length,
    };
  }

  private async queryPeriodRawValues(scope: BusinessResultsScope): Promise<BusinessResultsRawValues> {
    const [goodsAndCogs, headerPromo, otherIncome, otherExpense] = await Promise.all([
      this.queryGoodsAndCogs(scope),
      this.queryHeaderPromo(scope),
      this.queryOtherLines('in', scope),
      this.queryOtherLines('out', scope),
    ]);
    return {
      goodsSoldOut: goodsAndCogs.goodsSoldOut,
      goodsReturnedIn: goodsAndCogs.goodsReturnedIn,
      cogsOut: goodsAndCogs.cogsOut,
      cogsReturnedIn: goodsAndCogs.cogsReturnedIn,
      // "Khuyến mại" = per-line discount (invoice_items.lineDiscount, already
      // netted out of lineTotal — see goodsSoldOut/In below) + header-level
      // voucher/discount-code/promotion + loyalty points. Both pools are real
      // promotional spend; the invoice detail dialog shows per-line "KM ..."
      // labels that only ever hit lineDiscount, never invoice.discountAmount.
      promoOnSaleOut: goodsAndCogs.lineDiscountOut + headerPromo.headerSaleAndExchange,
      promoOnReturnIn: goodsAndCogs.lineDiscountIn + headerPromo.headerReturn,
      otherIncomeByCategory: otherIncome.byCategory,
      otherIncomeUncategorized: otherIncome.uncategorized,
      otherExpenseByCategory: otherExpense.byCategory,
      otherExpenseUncategorized: otherExpense.uncategorized,
    };
  }

  /**
   * 2.1.1.a/b (GROSS, before any discount) + 2.1.3.a/b's line-discount
   * component + 3.1.1/3.1.2 — split by line direction. "Tiền hàng bán ra"
   * must be the pre-discount list price (Σ quantity×unitPrice), not
   * `lineTotal` (which already has `lineDiscount` subtracted) — otherwise
   * per-line promotions silently vanish from "Khuyến mại" instead of showing
   * up there. lineTotal = quantity×unitPrice − lineDiscount always holds, so
   * goodsSoldOut(gross) − lineDiscountOut recovers the exact same net figure
   * the old lineTotal-based formula produced — this only re-attributes money
   * between 2.1.1 and 2.1.3, the I/II/III/IV totals are unaffected.
   */
  private async queryGoodsAndCogs(scope: BusinessResultsScope): Promise<{
    goodsSoldOut: number;
    goodsReturnedIn: number;
    lineDiscountOut: number;
    lineDiscountIn: number;
    cogsOut: number;
    cogsReturnedIn: number;
  }> {
    const rows = await this.source
      .invoiceLineQuery(scope)
      .select('li.direction', 'direction')
      .addSelect('COALESCE(SUM(li.quantity * li.unitPrice), 0)', 'grossSum')
      .addSelect('COALESCE(SUM(li.lineDiscount), 0)', 'lineDiscountSum')
      .addSelect('COALESCE(SUM(li.quantity * li.costPrice), 0)', 'cogsSum')
      .groupBy('li.direction')
      .getRawMany<{
        direction: ItemDirection;
        grossSum: string;
        lineDiscountSum: string;
        cogsSum: string;
      }>();

    const out = rows.find((r) => r.direction === ItemDirection.OUT);
    const inn = rows.find((r) => r.direction === ItemDirection.IN);
    return {
      goodsSoldOut: Number(out?.grossSum ?? 0),
      goodsReturnedIn: Number(inn?.grossSum ?? 0),
      lineDiscountOut: Number(out?.lineDiscountSum ?? 0),
      lineDiscountIn: Number(inn?.lineDiscountSum ?? 0),
      cogsOut: Number(out?.cogsSum ?? 0),
      cogsReturnedIn: Number(inn?.cogsSum ?? 0),
    };
  }

  /**
   * 2.1.3.a/b's HEADER-level component — Σ (discountAmount +
   * pointsDiscountAmount) per invoice header (voucher/discount-code/promotion
   * redemptions + loyalty points; `invoice.discountAmount` is a SEPARATE pool
   * from `invoice_items.lineDiscount`, summed from `invoice_promotions`, not a
   * rollup of line discounts — see queryGoodsAndCogs for the line-level half).
   * Split by invoice type; EXCHANGE is grouped with SALE ("a" — treated as a
   * new sale), per confirmed product decision (TKT-PRF-04).
   */
  private async queryHeaderPromo(
    scope: BusinessResultsScope,
  ): Promise<{ headerSaleAndExchange: number; headerReturn: number }> {
    const rows = await this.source
      .invoiceQuery(scope)
      .select('invoice.type', 'type')
      .addSelect(
        'COALESCE(SUM(invoice.discountAmount + invoice.pointsDiscountAmount), 0)',
        'promoSum',
      )
      .groupBy('invoice.type')
      .getRawMany<{ type: InvoiceType; promoSum: string }>();

    const saleAndExchange = rows
      .filter((r) => r.type === InvoiceType.SALE || r.type === InvoiceType.EXCHANGE)
      .reduce((sum, r) => sum + Number(r.promoSum ?? 0), 0);
    const returned = rows.find((r) => r.type === InvoiceType.RETURN);
    return {
      headerSaleAndExchange: saleAndExchange,
      headerReturn: Number(returned?.promoSum ?? 0),
    };
  }

  /**
   * 2.2.{i} / 3.2.{i} — Σ voucher-line amounts per category, cash and deposit
   * vouchers combined (they share cash_voucher_categories, so merging by
   * categoryId lines up rows). `null` category = the uncategorized bucket.
   */
  private async queryOtherLines(
    direction: OtherLineDirection,
    scope: BusinessResultsScope,
  ): Promise<OtherLines> {
    const perKind = await Promise.all(
      VOUCHER_KINDS_BY_DIRECTION[direction].map((kind) =>
        this.source
          .voucherLineQuery(kind, scope)
          .select('line.categoryId', 'categoryId')
          .addSelect('COALESCE(SUM(line.amount), 0)', 'total')
          .groupBy('line.categoryId')
          .getRawMany<{ categoryId: string | null; total: string }>(),
      ),
    );

    const byCategory: Record<string, number> = {};
    let uncategorized = 0;
    for (const r of perKind.flat()) {
      const amount = Number(r.total ?? 0);
      if (r.categoryId === null) {
        uncategorized += amount;
      } else {
        byCategory[r.categoryId] = (byCategory[r.categoryId] ?? 0) + amount;
      }
    }
    return { byCategory, uncategorized };
  }

  /** Every active cash-voucher category of the given direction for the org — drives 2.2's/3.2's dynamic row set. */
  private async queryOtherCategories(
    organizationId: string,
    direction: CashVoucherCategoryDirection,
  ): Promise<OtherLineCategory[]> {
    const categories = await this.cashVoucherCategories.find({
      where: { organizationId, direction, isActive: true },
      order: { displayOrder: 'ASC' },
    });
    return categories.map((c) => ({ id: c.id, name: c.name, displayOrder: c.displayOrder }));
  }
}
