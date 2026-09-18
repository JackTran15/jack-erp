import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CASH_FUND_REPORT_KEYS,
  CASH_FUND_ROW_KEYS,
  InvoiceReportResult,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../../rbac/rbac.service';
import { resolveReportBranchIds } from '../../report-core/report-query.util';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';
import { CASH_CONSOLIDATED, ReportDefinition, cashFundColumn } from '../report-definition';
import {
  CashFundCategory,
  CashFundPeriodService,
  FundAmounts,
  round2,
} from '../services/cash-fund-period.service';

/** Stable keys of the fixed lines; category lines are `inCategory:<id>` / `outCategory:<id>`. */
export const SITUATION_LINE_KEYS = {
  OPENING: 'opening',
  IN_TOTAL: 'inTotal',
  IN_SALES: 'inSales',
  IN_UNCATEGORIZED: 'inUncategorized',
  OUT_TOTAL: 'outTotal',
  OUT_PURCHASE: 'outPurchase',
  OUT_UNCATEGORIZED: 'outUncategorized',
  CLOSING: 'closing',
} as const;

const LABELS = {
  [SITUATION_LINE_KEYS.OPENING]: 'I. Tiền đầu kỳ',
  [SITUATION_LINE_KEYS.IN_TOTAL]: 'II. Tiền thu trong kỳ',
  [SITUATION_LINE_KEYS.IN_SALES]: 'Thu từ bán hàng',
  [SITUATION_LINE_KEYS.IN_UNCATEGORIZED]: 'Thu khác',
  [SITUATION_LINE_KEYS.OUT_TOTAL]: 'III. Tiền chi trong kỳ',
  [SITUATION_LINE_KEYS.OUT_PURCHASE]: 'Chi mua hàng hóa',
  [SITUATION_LINE_KEYS.OUT_UNCATEGORIZED]: 'Chi khác',
  [SITUATION_LINE_KEYS.CLOSING]: 'IV. Tiền cuối kỳ (IV = I + II - III)',
} as const;

interface SituationLine {
  key: string;
  label: string;
  amounts: FundAmounts;
  bold: boolean;
  indentLevel: number;
}

const addFunds = (...parts: FundAmounts[]): FundAmounts => ({
  cash: round2(parts.reduce((s, p) => s + p.cash, 0)),
  deposit: round2(parts.reduce((s, p) => s + p.deposit, 0)),
});

const subFunds = (a: FundAmounts, b: FundAmounts): FundAmounts => ({
  cash: round2(a.cash - b.cash),
  deposit: round2(a.deposit - b.deposit),
});

const isZero = (a: FundAmounts): boolean => a.cash === 0 && a.deposit === 0;

/**
 * "Tình hình thu chi" — the fixed I / II / III / IV skeleton with one line per
 * category that moved money in the period (AC-03..AC-06). Rows are built here,
 * not in SQL: the skeleton must render even for an empty period, and IV must be
 * exactly I + II − III on the rounded figures the user sees (AC-04).
 */
@Injectable()
export class CashInOutSituationReport implements ReportDefinition {
  readonly key = CASH_FUND_REPORT_KEYS.CASH_IN_OUT_SITUATION;

  constructor(
    private readonly period: CashFundPeriodService,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(): Promise<ReportColumnHeader[]> {
    return [
      cashFundColumn('lineLabel', ReportColumnDataType.STRING, { filterKind: 'none' }),
      cashFundColumn('cash', ReportColumnDataType.CURRENCY, { filterKind: 'none' }),
      cashFundColumn('deposit', ReportColumnDataType.CURRENCY, { filterKind: 'none' }),
      cashFundColumn('total', ReportColumnDataType.CURRENCY, { filterKind: 'none' }),
    ];
  }

  async buildData(dto: CashFundReportSearchDto, actor: ActorContext): Promise<InvoiceReportResult> {
    const period = dto.filters.period;
    if (!period?.from || !period?.to) {
      throw new BadRequestException('filters.period.from/to is required');
    }
    if (period.from > period.to) {
      throw new BadRequestException('filters.period.from must not be after filters.period.to');
    }

    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      CASH_CONSOLIDATED,
    );
    const branchIds = resolveReportBranchIds(
      hasConsolidated,
      undefined,
      dto.filters.branchId ?? actor.branchId ?? undefined,
      actor,
    );
    const scope = { organizationId: actor.organizationId, branchIds };

    const [opening, totals, categories] = await Promise.all([
      this.period.openingBalance(scope, period.from),
      this.period.periodTotals(scope, period.from, period.to),
      this.period.categories(actor.organizationId),
    ]);

    const inLines = this.categoryLines(categories, 'IN', totals.inByCategory, 'inCategory');
    const outLines = this.categoryLines(categories, 'OUT', totals.outByCategory, 'outCategory');
    // A line whose category id is unknown to the catalogue (hard-deleted row) has
    // no name to render under; its money is still real and lands in "khác" so II
    // and III keep equalling what the vouchers moved.
    const inUncategorized = addFunds(
      totals.inUncategorized,
      ...this.orphanAmounts(categories, totals.inByCategory),
    );
    const outUncategorized = addFunds(
      totals.outUncategorized,
      ...this.orphanAmounts(categories, totals.outByCategory),
    );
    const inTotal = addFunds(totals.inSales, ...inLines.map((l) => l.amounts), inUncategorized);
    const outTotal = addFunds(
      totals.outPurchase,
      ...outLines.map((l) => l.amounts),
      outUncategorized,
    );
    const closing = subFunds(addFunds(opening, inTotal), outTotal);

    const fixed = (key: keyof typeof LABELS, amounts: FundAmounts, bold: boolean, indent = 0) => ({
      key,
      label: LABELS[key],
      amounts,
      bold,
      indentLevel: indent,
    });
    const lines: SituationLine[] = [
      fixed(SITUATION_LINE_KEYS.OPENING, opening, true),
      fixed(SITUATION_LINE_KEYS.IN_TOTAL, inTotal, true),
      fixed(SITUATION_LINE_KEYS.IN_SALES, totals.inSales, false, 1),
      ...inLines,
      fixed(SITUATION_LINE_KEYS.IN_UNCATEGORIZED, inUncategorized, false, 1),
      fixed(SITUATION_LINE_KEYS.OUT_TOTAL, outTotal, true),
      fixed(SITUATION_LINE_KEYS.OUT_PURCHASE, totals.outPurchase, false, 1),
      ...outLines,
      fixed(SITUATION_LINE_KEYS.OUT_UNCATEGORIZED, outUncategorized, false, 1),
      fixed(SITUATION_LINE_KEYS.CLOSING, closing, true),
    ];

    const rows: ReportRow[] = lines.map((l) => ({
      lineLabel: l.label,
      cash: l.amounts.cash,
      deposit: l.amounts.deposit,
      total: round2(l.amounts.cash + l.amounts.deposit),
      [CASH_FUND_ROW_KEYS.ROW_KIND]: 'line',
      [CASH_FUND_ROW_KEYS.LINE_KEY]: l.key,
      [CASH_FUND_ROW_KEYS.BOLD]: l.bold ? 1 : 0,
      [CASH_FUND_ROW_KEYS.INDENT_LEVEL]: l.indentLevel,
    }));
    // Every figure is already a total; a "Tổng" footer would double-count.
    return { rows, totals: null, total: rows.length };
  }

  private orphanAmounts(
    categories: CashFundCategory[],
    byCategory: Record<string, FundAmounts>,
  ): FundAmounts[] {
    const known = new Set(categories.map((c) => c.id));
    return Object.entries(byCategory)
      .filter(([id]) => !known.has(id))
      .map(([, amounts]) => amounts);
  }

  /**
   * One line per category of the given direction that moved money (AC-05), in
   * the catalogue's display order. A category attached to a voucher of the other
   * direction still counts under the voucher's direction (the money did move that
   * way), which is why the lookup is by id across the whole catalogue.
   */
  private categoryLines(
    categories: CashFundCategory[],
    direction: 'IN' | 'OUT',
    byCategory: Record<string, FundAmounts>,
    keyPrefix: string,
  ): SituationLine[] {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const ordered = [...categories.filter((c) => c.direction === direction)];
    // Categories of the other direction that still received lines go last, in name order.
    const stray = Object.keys(byCategory)
      .filter((id) => byId.get(id)?.direction !== direction)
      .map((id) => byId.get(id))
      .filter((c): c is CashFundCategory => !!c)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return [...ordered, ...stray]
      .filter((c) => byCategory[c.id] && !isZero(byCategory[c.id]))
      .map((c) => ({
        key: `${keyPrefix}:${c.id}`,
        label: c.name,
        amounts: byCategory[c.id],
        bold: false,
        indentLevel: 1,
      }));
  }
}
