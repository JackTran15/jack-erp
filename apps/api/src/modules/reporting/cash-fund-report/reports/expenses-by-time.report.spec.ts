import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CASH_FUND_ROW_KEYS, ReportRow } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../../rbac/rbac.service';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';
import { ExpenseLinesQuery } from '../services/expense-lines.query';
import { ExpensesByTimeReport, bucketEnd, bucketLabel } from './expenses-by-time.report';

const BRANCH_A = 'b-a';
const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  roles: [],
  branchIds: [BRANCH_A],
} as unknown as ActorContext;

/**
 * What `GROUP BY date_trunc('day', doc_date)` over the 02-requirements fixture
 * returns for branch A, 09/2026: PC-02 (08/09: 90.000 điện + 10.000 nước),
 * PC-03 (09/09: 60.000 điện), PC-04 (10/09: 40.000, no category). PC-01
 * (SUPPLIER_PAYMENT), PC-05/PC-05R (reversed), PC-06 (branch B) and PC-07
 * (DRAFT) are excluded by the SQL, so they never reach the mocked rows.
 */
const FIXTURE_DAYS = [
  { bucket_start: '2026-09-08', amount: '100000.00' },
  { bucket_start: '2026-09-09', amount: '60000.00' },
  { bucket_start: '2026-09-10', amount: '40000.00' },
];
/** Same lines, restricted to "Tiền điện" (AC-17): PC-04 has no category, so 10/09 is gone. */
const FIXTURE_DAYS_ELECTRIC = [
  { bucket_start: '2026-09-08', amount: '90000.00' },
  { bucket_start: '2026-09-09', amount: '60000.00' },
];

function dto(
  filters: Partial<CashFundReportSearchDto['filters']> = {},
  rest: Partial<Omit<CashFundReportSearchDto, 'filters'>> = {},
): CashFundReportSearchDto {
  return {
    reportType: 'expenses-by-time',
    columns: ['bucket', 'amount'],
    filters: { period: { from: '2026-09-01', to: '2026-09-30' }, ...filters },
    ...rest,
  } as CashFundReportSearchDto;
}

const labels = (rows: ReportRow[]) => rows.map((r) => r.bucket);
const amounts = (rows: ReportRow[]) => rows.map((r) => r.amount);

describe('ExpensesByTimeReport', () => {
  let query: jest.Mock;
  let rbac: { hasPermission: jest.Mock };
  let report: ExpensesByTimeReport;

  const lastSql = () => query.mock.calls[query.mock.calls.length - 1] as [string, unknown[]];

  beforeEach(() => {
    query = jest.fn().mockResolvedValue(FIXTURE_DAYS);
    rbac = { hasPermission: jest.fn().mockResolvedValue(false) };
    const dataSource = { query } as unknown as DataSource;
    report = new ExpensesByTimeReport(
      dataSource,
      new ExpenseLinesQuery(dataSource),
      rbac as unknown as RbacService,
    );
  });

  it('has a linked bucket column and a currency amount column', async () => {
    const cols = await report.buildColumns();
    expect(cols.map((c) => c.col)).toEqual(['bucket', 'amount']);
    expect(cols.map((c) => c.name)).toEqual(['Ngày', 'Số tiền chi']);
    expect(cols.find((c) => c.col === 'bucket')).toMatchObject({ link: true, filterKind: 'text' });
    expect(cols.find((c) => c.col === 'amount')).toMatchObject({ filterKind: 'number', align: 'right' });
  });

  it('renders one row per day with money, ascending, with the footer total (AC-16)', async () => {
    const { rows, totals, total } = await report.buildData(dto(), actor);

    expect(labels(rows)).toEqual(['08/09/2026', '09/09/2026', '10/09/2026']);
    expect(amounts(rows)).toEqual([100000, 60000, 40000]);
    expect(totals).toEqual({ amount: 200000 });
    expect(total).toBe(3);
    // No row for 04/09 (PC-01, chi mua hàng hóa) nor 11/09–12/09 (PC-05 reversed).
    expect(labels(rows)).not.toContain('04/09/2026');
    expect(labels(rows)).not.toContain('11/09/2026');
  });

  it('defaults the bucket to day and binds the unit as a parameter after the period', async () => {
    await report.buildData(dto(), actor);
    const [sql, params] = lastSql();
    expect(sql).toContain('date_trunc($5::text, v.doc_date::timestamp)::date::text AS bucket_start');
    expect(sql).toContain('GROUP BY 1');
    expect(sql).toContain('ORDER BY 1 ASC');
    expect(params).toEqual(['org-1', [BRANCH_A], '2026-09-01', '2026-09-30', 'day']);
  });

  it('groups by month into a single 09/2026 row spanning the whole month (AC-16)', async () => {
    query.mockResolvedValue([{ bucket_start: '2026-09-01', amount: '200000.00' }]);
    const { rows, totals } = await report.buildData(
      dto({ period: { from: '2026-01-01', to: '2026-12-31' }, timeBucket: 'month' }),
      actor,
    );
    const [, params] = lastSql();
    expect(params[4]).toBe('month');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      bucket: '09/2026',
      amount: 200000,
      [CASH_FUND_ROW_KEYS.BUCKET_FROM]: '2026-09-01',
      [CASH_FUND_ROW_KEYS.BUCKET_TO]: '2026-09-30',
    });
    expect(totals).toEqual({ amount: 200000 });
  });

  it('clamps bucketFrom / bucketTo to the requested period so a drill-down never widens it', async () => {
    query.mockResolvedValue([{ bucket_start: '2026-01-01', amount: '200000.00' }]);
    const { rows } = await report.buildData(dto({ timeBucket: 'year' }), actor);
    expect(rows[0]).toMatchObject({
      bucket: '2026',
      [CASH_FUND_ROW_KEYS.BUCKET_FROM]: '2026-09-01',
      [CASH_FUND_ROW_KEYS.BUCKET_TO]: '2026-09-30',
    });

    // A week starting before the period (Monday 31/08) and one ending after it (Monday 28/09).
    query.mockResolvedValue([
      { bucket_start: '2026-08-31', amount: '1000.00' },
      { bucket_start: '2026-09-28', amount: '2000.00' },
    ]);
    const week = await report.buildData(dto({ timeBucket: 'week' }), actor);
    expect(week.rows[0]).toMatchObject({
      bucket: 'Tuần 36/2026',
      [CASH_FUND_ROW_KEYS.BUCKET_FROM]: '2026-09-01',
      [CASH_FUND_ROW_KEYS.BUCKET_TO]: '2026-09-06',
    });
    expect(week.rows[1]).toMatchObject({
      bucket: 'Tuần 40/2026',
      [CASH_FUND_ROW_KEYS.BUCKET_FROM]: '2026-09-28',
      [CASH_FUND_ROW_KEYS.BUCKET_TO]: '2026-09-30',
    });
  });

  it('restricts to the chosen mục chi in SQL and re-sums the buckets (AC-17)', async () => {
    query.mockResolvedValue(FIXTURE_DAYS_ELECTRIC);
    const { rows, totals, total } = await report.buildData(
      dto({ categoryIds: ['cat-electric'] }),
      actor,
    );
    const [sql, params] = lastSql();
    expect(sql).toContain('v.category_id::text = ANY($5::text[])');
    // The bucket unit is bound after the category ids.
    expect(sql).toContain('date_trunc($6::text, v.doc_date::timestamp)');
    expect(params).toEqual(['org-1', [BRANCH_A], '2026-09-01', '2026-09-30', ['cat-electric'], 'day']);
    expect(labels(rows)).toEqual(['08/09/2026', '09/09/2026']);
    expect(amounts(rows)).toEqual([90000, 60000]);
    expect(totals).toEqual({ amount: 150000 });
    expect(total).toBe(2);
  });

  it('excludes purchase / supplier payments in SQL through the shared predicate (A-02, A-12)', async () => {
    await report.buildData(dto(), actor);
    const [sql] = lastSql();
    expect(sql).toContain("v.direction = 'out'");
    expect(sql).toContain('NOT (');
    expect(sql).toContain("v.purpose IN ('PURCHASE', 'SUPPLIER_PAYMENT')");
    expect(sql).toContain('v.doc_date >= $3::date AND v.doc_date <= $4::date');
    expect(sql).toContain('FROM cash_payment_lines l');
    expect(sql).toContain('FROM bank_payment_lines l');
  });

  it('scopes to branch A through the shared $2 predicate so PC-06 of branch B is absent (AC-07)', async () => {
    await report.buildData(dto(), actor);
    const [sql, params] = lastSql();
    expect(sql).toContain('($2::text[] IS NULL OR h.branch_id = ANY($2::text[]))');
    expect(params[1]).toEqual([BRANCH_A]);
  });

  it('applies column filters after aggregation', async () => {
    const contains = await report.buildData(
      dto({}, { columnFilters: [{ col: 'bucket', contains: '09/09' }] }),
      actor,
    );
    expect(labels(contains.rows)).toEqual(['09/09/2026']);
    expect(contains.total).toBe(1);
    expect(contains.totals).toEqual({ amount: 60000 });

    const lte = await report.buildData(dto({}, { columnFilters: [{ col: 'amount', lte: 60000 }] }), actor);
    expect(labels(lte.rows)).toEqual(['09/09/2026', '10/09/2026']);
    expect(lte.totals).toEqual({ amount: 100000 });
  });

  it('drops zero buckets and carries the hidden row keys for drill-down', async () => {
    query.mockResolvedValue([...FIXTURE_DAYS, { bucket_start: '2026-09-11', amount: '0.00' }]);
    const { rows } = await report.buildData(dto(), actor);
    expect(labels(rows)).not.toContain('11/09/2026');
    for (const r of rows) {
      expect(r[CASH_FUND_ROW_KEYS.ROW_KIND]).toBe('detail');
      expect(r[CASH_FUND_ROW_KEYS.BOLD]).toBe(0);
      expect(r[CASH_FUND_ROW_KEYS.INDENT_LEVEL]).toBe(0);
    }
    expect(rows[0]).toMatchObject({
      [CASH_FUND_ROW_KEYS.BUCKET_FROM]: '2026-09-08',
      [CASH_FUND_ROW_KEYS.BUCKET_TO]: '2026-09-08',
    });
  });

  it('paginates the rows while totals stay the whole set', async () => {
    const { rows, totals, total } = await report.buildData(dto({}, { page: 2, limit: 2 }), actor);
    expect(labels(rows)).toEqual(['10/09/2026']);
    expect(total).toBe(3);
    expect(totals).toEqual({ amount: 200000 });
  });

  describe('branch scope', () => {
    it('refuses a branch the actor is not assigned to', async () => {
      await expect(report.buildData(dto({ branchId: 'b-b' }), actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('drops the branch predicate for a consolidated actor with no branch filter', async () => {
      rbac.hasPermission.mockResolvedValue(true);
      const chainActor = { ...actor, branchId: undefined } as unknown as ActorContext;
      await report.buildData(dto(), chainActor);
      const [, params] = lastSql();
      expect(params).toEqual(['org-1', null, '2026-09-01', '2026-09-30', 'day']);
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

  describe('timeBucket validation (the global ValidationPipe → 400)', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    const body = (timeBucket: unknown) => ({
      reportType: 'expenses-by-time',
      columns: ['bucket', 'amount'],
      filters: { period: { from: '2026-09-01', to: '2026-09-30' }, timeBucket },
    });
    const run = (timeBucket: unknown) =>
      pipe.transform(body(timeBucket), { type: 'body', metatype: CashFundReportSearchDto });

    it('rejects an unknown bucket with 400', async () => {
      await expect(run('fortnight')).rejects.toBeInstanceOf(BadRequestException);
      await expect(run('DAY')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts the five buckets', async () => {
      for (const unit of ['day', 'week', 'month', 'quarter', 'year']) {
        const parsed = (await run(unit)) as CashFundReportSearchDto;
        expect(parsed.filters.timeBucket).toBe(unit);
      }
    });
  });

  describe('bucket labels and ends', () => {
    it('formats each unit the way the reference app does', () => {
      expect(bucketLabel('day', '2026-09-08')).toBe('08/09/2026');
      expect(bucketLabel('week', '2026-09-07')).toBe('Tuần 37/2026'); // Monday 07/09/2026
      expect(bucketLabel('month', '2026-09-01')).toBe('09/2026');
      expect(bucketLabel('quarter', '2026-07-01')).toBe('Q3/2026');
      expect(bucketLabel('year', '2026-01-01')).toBe('2026');
    });

    it('numbers ISO weeks by their week-year at the boundaries', () => {
      expect(bucketLabel('week', '2026-12-28')).toBe('Tuần 53/2026'); // 2026 has 53 ISO weeks
      expect(bucketLabel('week', '2027-01-04')).toBe('Tuần 01/2027');
      expect(bucketLabel('week', '2024-12-30')).toBe('Tuần 01/2025'); // Monday of week 1 of 2025
    });

    it('ends a bucket on its last calendar day', () => {
      expect(bucketEnd('day', '2026-09-08')).toBe('2026-09-08');
      expect(bucketEnd('week', '2026-09-07')).toBe('2026-09-13');
      expect(bucketEnd('month', '2026-02-01')).toBe('2026-02-28');
      expect(bucketEnd('month', '2024-02-01')).toBe('2024-02-29');
      expect(bucketEnd('quarter', '2026-10-01')).toBe('2026-12-31');
      expect(bucketEnd('year', '2026-01-01')).toBe('2026-12-31');
    });
  });
});
