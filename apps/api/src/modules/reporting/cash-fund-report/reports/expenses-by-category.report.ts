import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CASH_FUND_REPORT_KEYS,
  CASH_FUND_ROW_KEYS,
  CASH_FUND_UNCATEGORIZED,
  InvoiceReportResult,
  ReportCellValue,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../../rbac/rbac.service';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import { resolveReportBranchIds } from '../../report-core/report-query.util';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';
import { CASH_CONSOLIDATED, ReportDefinition, cashFundColumn } from '../report-definition';
import { CashFundPeriodService, round2 } from '../services/cash-fund-period.service';
import { ExpenseLinesQuery } from '../services/expense-lines.query';

/** Label of the lines that carry no category — the "Chi khác" of "Tình hình thu chi". */
export const UNCATEGORIZED_EXPENSE_LABEL = 'Chi khác';

interface CategoryRow {
  /** Category id, or `CASH_FUND_UNCATEGORIZED` for the no-category bucket. */
  categoryId: string;
  categoryName: string;
  /**
   * Provisional: the category `code` until the category tree lands
   * (`parent_group_id`), at which point this becomes the parent group's name.
   */
  categoryKind: string | null;
  amount: number;
}

/**
 * "Chi tiền theo mục chi" — one row per mục chi that spent money in the period
 * (AC-12): Σ of expense lines grouped by `category_id`, largest first. Purchase
 * / supplier payments are "Chi mua hàng hóa", not a mục chi, and never appear
 * (A-02). The row's `categoryId` doubles as the drill-down key into
 * "Bảng kê tiền chi theo mục chi".
 */
@Injectable()
export class ExpensesByCategoryReport implements ReportDefinition {
  readonly key = CASH_FUND_REPORT_KEYS.EXPENSES_BY_CATEGORY;

  constructor(
    private readonly lines: ExpenseLinesQuery,
    private readonly period: CashFundPeriodService,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(): Promise<ReportColumnHeader[]> {
    // All four are in the header; hiding `categoryId` / `categoryKind` by default is the FE's job.
    return [
      cashFundColumn('categoryId', ReportColumnDataType.STRING),
      cashFundColumn('categoryName', ReportColumnDataType.STRING, { link: true }),
      cashFundColumn('categoryKind', ReportColumnDataType.STRING),
      cashFundColumn('amount', ReportColumnDataType.CURRENCY),
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

    const [sums, categories] = await Promise.all([
      this.lines.sumByCategory(scope, period.from, period.to, dto.filters.categoryIds),
      this.period.categories(actor.organizationId),
    ]);
    const byId = new Map(categories.map((c) => [c.id, c]));

    const all: CategoryRow[] = sums
      .filter((s) => s.amount !== 0)
      .map((s) => {
        if (s.categoryId === null) {
          return {
            categoryId: CASH_FUND_UNCATEGORIZED,
            categoryName: UNCATEGORIZED_EXPENSE_LABEL,
            categoryKind: null,
            amount: s.amount,
          };
        }
        const category = byId.get(s.categoryId);
        // A hard-deleted category has no name left; its money is still real, so
        // the row stays and is labelled by its id rather than dropped.
        return {
          categoryId: s.categoryId,
          categoryName: category?.name ?? s.categoryId,
          categoryKind: category?.code ?? null,
          amount: s.amount,
        };
      });

    const filtered = dto.columnFilters?.length
      ? all.filter((r) =>
          dto.columnFilters!.every((f) => matchColumnFilter(cellValue(r, f.col), f)),
        )
      : all;
    filtered.sort(
      (a, b) => b.amount - a.amount || a.categoryName.localeCompare(b.categoryName, 'vi'),
    );

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const offset = (page - 1) * limit;
    // The `categoryId` column IS the drill-down key (CASH_FUND_ROW_KEYS.CATEGORY_ID
    // = 'categoryId'): one field serves the hidden column and the row key.
    const rows: ReportRow[] = filtered.slice(offset, offset + limit).map((r) => ({
      [CASH_FUND_ROW_KEYS.CATEGORY_ID]: r.categoryId,
      categoryName: r.categoryName,
      categoryKind: r.categoryKind,
      amount: r.amount,
      [CASH_FUND_ROW_KEYS.ROW_KIND]: 'detail',
      [CASH_FUND_ROW_KEYS.BOLD]: 0,
      [CASH_FUND_ROW_KEYS.INDENT_LEVEL]: 0,
    }));

    return {
      rows,
      totals: { amount: round2(filtered.reduce((sum, r) => sum + r.amount, 0)) },
      total: filtered.length,
    };
  }
}

function cellValue(row: CategoryRow, col: string): ReportCellValue {
  switch (col) {
    case 'categoryId':
      return row.categoryId;
    case 'categoryName':
      return row.categoryName;
    case 'categoryKind':
      return row.categoryKind;
    case 'amount':
      return row.amount;
    default:
      return null;
  }
}
