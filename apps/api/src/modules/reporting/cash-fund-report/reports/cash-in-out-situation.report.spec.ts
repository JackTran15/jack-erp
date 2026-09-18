import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CASH_FUND_ROW_KEYS, ReportRow } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../../rbac/rbac.service';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';
import {
  CashFundCategory,
  CashFundPeriodService,
  CashFundPeriodTotals,
} from '../services/cash-fund-period.service';
import { CashInOutSituationReport, SITUATION_LINE_KEYS } from './cash-in-out-situation.report';

const BRANCH_A = 'b-a';
const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  roles: [],
  branchIds: [BRANCH_A],
} as unknown as ActorContext;

const CATEGORIES: CashFundCategory[] = [
  { id: 'cat-interest', code: 'LAI', name: 'Thu lãi', direction: 'IN', displayOrder: 1, isActive: true, deletedAt: null },
  { id: 'cat-electric', code: 'DIEN', name: 'Tiền điện', direction: 'OUT', displayOrder: 1, isActive: true, deletedAt: null },
  { id: 'cat-water', code: 'NUOC', name: 'Tiền nước', direction: 'OUT', displayOrder: 2, isActive: true, deletedAt: null },
  { id: 'cat-rent', code: 'THUE', name: 'Tiền thuê', direction: 'OUT', displayOrder: 3, isActive: true, deletedAt: null },
  { id: 'cat-salary', code: 'LUONG', name: 'Tiền lương', direction: 'OUT', displayOrder: 4, isActive: true, deletedAt: null },
];

/** Aggregates of the 02-requirements fixture for branch A, September 2026. */
const FIXTURE_TOTALS: CashFundPeriodTotals = {
  inSales: { cash: 1000000, deposit: 1600000 },
  outPurchase: { cash: 200000, deposit: 0 },
  inByCategory: { 'cat-interest': { cash: 50000, deposit: 0 } },
  inUncategorized: { cash: 20000, deposit: 0 },
  outByCategory: {
    'cat-electric': { cash: 150000, deposit: 0 },
    'cat-water': { cash: 10000, deposit: 0 },
  },
  outUncategorized: { cash: 40000, deposit: 0 },
};
const FIXTURE_OPENING = { cash: 500000, deposit: 1000000 };

const EMPTY_TOTALS: CashFundPeriodTotals = {
  inSales: { cash: 0, deposit: 0 },
  outPurchase: { cash: 0, deposit: 0 },
  inByCategory: {},
  inUncategorized: { cash: 0, deposit: 0 },
  outByCategory: {},
  outUncategorized: { cash: 0, deposit: 0 },
};

function dto(overrides: Partial<CashFundReportSearchDto['filters']> = {}): CashFundReportSearchDto {
  return {
    reportType: 'cash-in-out-situation',
    columns: ['lineLabel', 'cash', 'deposit', 'total'],
    filters: { period: { from: '2026-09-01', to: '2026-09-30' }, ...overrides },
  } as CashFundReportSearchDto;
}

const labels = (rows: ReportRow[]) => rows.map((r) => r.lineLabel);
const byKey = (rows: ReportRow[], key: string) =>
  rows.find((r) => r[CASH_FUND_ROW_KEYS.LINE_KEY] === key) as ReportRow;

describe('CashInOutSituationReport', () => {
  let period: jest.Mocked<Pick<CashFundPeriodService, 'openingBalance' | 'periodTotals' | 'categories'>>;
  let rbac: { hasPermission: jest.Mock };
  let report: CashInOutSituationReport;

  beforeEach(() => {
    period = {
      openingBalance: jest.fn().mockResolvedValue(FIXTURE_OPENING),
      periodTotals: jest.fn().mockResolvedValue(FIXTURE_TOTALS),
      categories: jest.fn().mockResolvedValue(CATEGORIES),
    };
    rbac = { hasPermission: jest.fn().mockResolvedValue(false) };
    report = new CashInOutSituationReport(
      period as unknown as CashFundPeriodService,
      rbac as unknown as RbacService,
    );
  });

  it('exposes the four fixed columns with no filter row', async () => {
    const cols = await report.buildColumns();
    expect(cols.map((c) => c.col)).toEqual(['lineLabel', 'cash', 'deposit', 'total']);
    expect(cols.map((c) => c.name)).toEqual(['Khoản mục', 'Tiền mặt', 'Tiền gửi', 'Tổng cộng']);
    expect(cols.every((c) => c.filterKind === 'none')).toBe(true);
  });

  it('renders the I–IV skeleton with one line per category that moved money (AC-03, AC-05)', async () => {
    const { rows, totals, total } = await report.buildData(dto(), actor);

    expect(labels(rows)).toEqual([
      'I. Tiền đầu kỳ',
      'II. Tiền thu trong kỳ',
      'Thu từ bán hàng',
      'Thu lãi',
      'Thu khác',
      'III. Tiền chi trong kỳ',
      'Chi mua hàng hóa',
      'Tiền điện',
      'Tiền nước',
      'Chi khác',
      'IV. Tiền cuối kỳ (IV = I + II - III)',
    ]);
    // "Tiền thuê" and "Tiền lương" exist in the catalogue but moved nothing (PC-05 reversed).
    expect(labels(rows)).not.toContain('Tiền thuê');
    expect(labels(rows)).not.toContain('Tiền lương');

    expect(byKey(rows, SITUATION_LINE_KEYS.IN_SALES)).toMatchObject({ cash: 1000000, deposit: 1600000, total: 2600000 });
    expect(byKey(rows, 'inCategory:cat-interest')).toMatchObject({ cash: 50000, deposit: 0, total: 50000 });
    expect(byKey(rows, SITUATION_LINE_KEYS.IN_UNCATEGORIZED)).toMatchObject({ cash: 20000, deposit: 0 });
    expect(byKey(rows, SITUATION_LINE_KEYS.OUT_PURCHASE)).toMatchObject({ cash: 200000, deposit: 0 });
    expect(byKey(rows, 'outCategory:cat-electric')).toMatchObject({ cash: 150000, deposit: 0 });
    expect(byKey(rows, 'outCategory:cat-water')).toMatchObject({ cash: 10000, deposit: 0 });
    expect(byKey(rows, SITUATION_LINE_KEYS.OUT_UNCATEGORIZED)).toMatchObject({ cash: 40000, deposit: 0 });

    // Every figure is already a total: no footer, `total` counts rows.
    expect(totals).toBeNull();
    expect(total).toBe(rows.length);
  });

  it('computes II, III and IV = I + II − III per fund on the rounded figures (AC-04)', async () => {
    const { rows } = await report.buildData(dto(), actor);
    expect(byKey(rows, SITUATION_LINE_KEYS.OPENING)).toMatchObject({ cash: 500000, deposit: 1000000, total: 1500000 });
    expect(byKey(rows, SITUATION_LINE_KEYS.IN_TOTAL)).toMatchObject({ cash: 1070000, deposit: 1600000, total: 2670000 });
    expect(byKey(rows, SITUATION_LINE_KEYS.OUT_TOTAL)).toMatchObject({ cash: 400000, deposit: 0, total: 400000 });
    expect(byKey(rows, SITUATION_LINE_KEYS.CLOSING)).toMatchObject({ cash: 1170000, deposit: 2600000, total: 3770000 });
  });

  it('marks the section lines bold and indents the detail lines (ADR-04)', async () => {
    const { rows } = await report.buildData(dto(), actor);
    const bold = rows.filter((r) => r[CASH_FUND_ROW_KEYS.BOLD] === 1).map((r) => r[CASH_FUND_ROW_KEYS.LINE_KEY]);
    expect(bold).toEqual(['opening', 'inTotal', 'outTotal', 'closing']);
    expect(byKey(rows, 'outCategory:cat-water')[CASH_FUND_ROW_KEYS.INDENT_LEVEL]).toBe(1);
    expect(byKey(rows, SITUATION_LINE_KEYS.OPENING)[CASH_FUND_ROW_KEYS.INDENT_LEVEL]).toBe(0);
    expect(rows.every((r) => r[CASH_FUND_ROW_KEYS.ROW_KIND] === 'line')).toBe(true);
  });

  it('keeps the nine-line skeleton, all zero, for a period with no vouchers (AC-06)', async () => {
    period.openingBalance.mockResolvedValue({ cash: 0, deposit: 0 });
    period.periodTotals.mockResolvedValue(EMPTY_TOTALS);
    const { rows } = await report.buildData(dto({ period: { from: '2025-01-01', to: '2025-12-31' } }), actor);
    expect(labels(rows)).toEqual([
      'I. Tiền đầu kỳ',
      'II. Tiền thu trong kỳ',
      'Thu từ bán hàng',
      'Thu khác',
      'III. Tiền chi trong kỳ',
      'Chi mua hàng hóa',
      'Chi khác',
      'IV. Tiền cuối kỳ (IV = I + II - III)',
    ]);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.cash === 0 && r.deposit === 0 && r.total === 0)).toBe(true);
  });

  it('folds money on a category the catalogue no longer has into "khác" so II still equals the vouchers', async () => {
    period.periodTotals.mockResolvedValue({
      ...FIXTURE_TOTALS,
      outByCategory: { ...FIXTURE_TOTALS.outByCategory, 'cat-gone': { cash: 5000, deposit: 0 } },
    });
    const { rows } = await report.buildData(dto(), actor);
    expect(byKey(rows, SITUATION_LINE_KEYS.OUT_UNCATEGORIZED).cash).toBe(45000);
    expect(byKey(rows, SITUATION_LINE_KEYS.OUT_TOTAL).cash).toBe(405000);
  });

  describe('branch scope (AC-07)', () => {
    it('scopes to the header branch for an actor without the consolidated key', async () => {
      await report.buildData(dto({ branchId: BRANCH_A }), actor);
      expect(period.openingBalance).toHaveBeenCalledWith(
        { organizationId: 'org-1', branchIds: [BRANCH_A] },
        '2026-09-01',
      );
    });

    it('refuses a branch the actor is not assigned to', async () => {
      await expect(report.buildData(dto({ branchId: 'b-b' }), actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('drops the branch predicate for a consolidated actor with no branch filter', async () => {
      rbac.hasPermission.mockResolvedValue(true);
      const chainActor = { ...actor, branchId: undefined } as unknown as ActorContext;
      await report.buildData(dto(), chainActor);
      expect(period.periodTotals).toHaveBeenCalledWith(
        { organizationId: 'org-1', branchIds: null },
        '2026-09-01',
        '2026-09-30',
      );
    });
  });

  it('requires a period and rejects an inverted one', async () => {
    await expect(report.buildData(dto({ period: undefined }), actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      report.buildData(dto({ period: { from: '2026-09-30', to: '2026-09-01' } }), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
