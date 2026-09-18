import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CASH_FUND_ROW_KEYS, CASH_FUND_UNCATEGORIZED, ReportRow } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../../rbac/rbac.service';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';
import { CashFundCategory, CashFundPeriodService } from '../services/cash-fund-period.service';
import { ExpenseLinesQuery } from '../services/expense-lines.query';
import { ExpensesByCategoryReport } from './expenses-by-category.report';

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

/**
 * What `GROUP BY category_id` over the 02-requirements fixture returns for
 * branch A, 09/2026: PC-02 (90.000 điện + 10.000 nước), PC-03 (60.000 điện),
 * PC-04 (40.000, no category). PC-01 (SUPPLIER_PAYMENT), PC-05/PC-05R
 * (reversed), PC-06 (branch B) and PC-07 (DRAFT) are excluded by the SQL, so
 * they never reach the rows the DataSource mock hands back.
 */
const FIXTURE_SUMS = [
  { category_id: 'cat-water', amount: '10000.00' },
  { category_id: null, amount: '40000.00' },
  { category_id: 'cat-electric', amount: '150000.00' },
];

function dto(
  filters: Partial<CashFundReportSearchDto['filters']> = {},
  rest: Partial<Omit<CashFundReportSearchDto, 'filters'>> = {},
): CashFundReportSearchDto {
  return {
    reportType: 'expenses-by-category',
    columns: ['categoryId', 'categoryName', 'categoryKind', 'amount'],
    filters: { period: { from: '2026-09-01', to: '2026-09-30' }, ...filters },
    ...rest,
  } as CashFundReportSearchDto;
}

const names = (rows: ReportRow[]) => rows.map((r) => r.categoryName);

describe('ExpensesByCategoryReport', () => {
  let query: jest.Mock;
  let period: { categories: jest.Mock };
  let rbac: { hasPermission: jest.Mock };
  let report: ExpensesByCategoryReport;

  const lastSql = () => query.mock.calls[query.mock.calls.length - 1] as [string, unknown[]];

  beforeEach(() => {
    query = jest.fn().mockResolvedValue(FIXTURE_SUMS);
    period = { categories: jest.fn().mockResolvedValue(CATEGORIES) };
    rbac = { hasPermission: jest.fn().mockResolvedValue(false) };
    report = new ExpensesByCategoryReport(
      new ExpenseLinesQuery({ query } as unknown as DataSource),
      period as unknown as CashFundPeriodService,
      rbac as unknown as RbacService,
    );
  });

  it('lists all four columns in the header — hiding id / kind is the FE registry', async () => {
    const cols = await report.buildColumns();
    expect(cols.map((c) => c.col)).toEqual(['categoryId', 'categoryName', 'categoryKind', 'amount']);
    expect(cols.map((c) => c.name)).toEqual(['ID Mục chi', 'Mục chi', 'Loại Mục chi', 'Số tiền chi']);
    expect(cols.find((c) => c.col === 'categoryName')?.link).toBe(true);
    expect(cols.find((c) => c.col === 'amount')).toMatchObject({ filterKind: 'number', align: 'right' });
  });

  it('renders one row per mục chi, largest first, with the footer total (AC-12)', async () => {
    const { rows, totals, total } = await report.buildData(dto(), actor);

    expect(names(rows)).toEqual(['Tiền điện', 'Chi khác', 'Tiền nước']);
    expect(rows.map((r) => r.amount)).toEqual([150000, 40000, 10000]);
    expect(rows[0]).toMatchObject({ categoryId: 'cat-electric', categoryKind: 'DIEN' });
    expect(rows[1]).toMatchObject({ categoryId: CASH_FUND_UNCATEGORIZED, categoryKind: null });
    expect(rows[2]).toMatchObject({ categoryId: 'cat-water', categoryKind: 'NUOC' });
    expect(totals).toEqual({ amount: 200000 });
    expect(total).toBe(3);
    // "Chi mua hàng hóa" is never a mục chi; nothing of PC-01 leaks in.
    expect(names(rows)).not.toContain('Chi mua hàng hóa');
    expect(totals!.amount).toBe(150000 + 40000 + 10000);
  });

  it('excludes purchase / supplier payments in SQL, not after the fact (AC-12, A-02)', async () => {
    await report.buildData(dto(), actor);
    const [sql] = lastSql();
    expect(sql).toContain("v.direction = 'out'");
    expect(sql).toContain('NOT (');
    expect(sql).toContain("v.purpose IN ('PURCHASE', 'SUPPLIER_PAYMENT')");
    expect(sql).toContain('v.doc_date >= $3::date AND v.doc_date <= $4::date');
    expect(sql).toContain('GROUP BY v.category_id');
  });

  it('scopes to branch A through the shared $2 predicate so PC-06 of branch B is absent (AC-12, AC-07)', async () => {
    await report.buildData(dto(), actor);
    const [sql, params] = lastSql();
    expect(sql).toContain('($2::text[] IS NULL OR h.branch_id = ANY($2::text[]))');
    expect(params).toEqual(['org-1', [BRANCH_A], '2026-09-01', '2026-09-30']);
  });

  it('counts a deposit-side payment line with a category too — no fund predicate', async () => {
    // Extra fixture: a bank payment (BANK_PAYMENT, fund = deposit) of 25.000 on "Tiền nước".
    query.mockResolvedValue([
      ...FIXTURE_SUMS.filter((r) => r.category_id !== 'cat-water'),
      { category_id: 'cat-water', amount: '35000.00' },
    ]);
    const { rows, totals } = await report.buildData(dto(), actor);
    const [sql] = lastSql();
    expect(sql).toContain('FROM bank_payment_lines l');
    expect(sql).toContain('FROM cash_payment_lines l');
    expect(sql).not.toMatch(/v\.fund\s*=/);
    expect(rows.find((r) => r.categoryId === 'cat-water')?.amount).toBe(35000);
    expect(totals).toEqual({ amount: 225000 });
  });

  it('applies column filters after aggregation', async () => {
    const { rows, totals, total } = await report.buildData(
      dto({}, { columnFilters: [{ col: 'categoryName', contains: 'điện' }] }),
      actor,
    );
    expect(names(rows)).toEqual(['Tiền điện']);
    expect(total).toBe(1);
    expect(totals).toEqual({ amount: 150000 });

    const lte = await report.buildData(dto({}, { columnFilters: [{ col: 'amount', lte: 40000 }] }), actor);
    expect(names(lte.rows)).toEqual(['Chi khác', 'Tiền nước']);
  });

  it("maps categoryIds 'uncategorized' onto category_id IS NULL, ids onto ANY", async () => {
    await report.buildData(dto({ categoryIds: [CASH_FUND_UNCATEGORIZED] }), actor);
    let [sql, params] = lastSql();
    expect(sql).toContain('v.category_id IS NULL');
    expect(sql).not.toContain('$5');
    expect(params).toHaveLength(4);

    await report.buildData(dto({ categoryIds: ['cat-electric', CASH_FUND_UNCATEGORIZED] }), actor);
    [sql, params] = lastSql();
    expect(sql).toContain('(v.category_id IS NULL OR v.category_id::text = ANY($5::text[]))');
    expect(params[4]).toEqual(['cat-electric']);

    await report.buildData(dto({ categoryIds: ['cat-electric'] }), actor);
    [sql] = lastSql();
    expect(sql).not.toContain('v.category_id IS NULL');
    expect(sql).toContain('v.category_id::text = ANY($5::text[])');
  });

  it('keeps a category the catalogue no longer has, labelled by its id', async () => {
    query.mockResolvedValue([...FIXTURE_SUMS, { category_id: 'cat-gone', amount: '5000.00' }]);
    const { rows, totals } = await report.buildData(dto(), actor);
    expect(rows.find((r) => r.categoryId === 'cat-gone')).toMatchObject({
      categoryName: 'cat-gone',
      categoryKind: null,
      amount: 5000,
    });
    expect(totals).toEqual({ amount: 205000 });
  });

  it('drops zero sums and carries the hidden row keys for drill-down', async () => {
    query.mockResolvedValue([...FIXTURE_SUMS, { category_id: 'cat-rent', amount: '0.00' }]);
    const { rows } = await report.buildData(dto(), actor);
    expect(names(rows)).not.toContain('Tiền thuê');
    for (const r of rows) {
      expect(r[CASH_FUND_ROW_KEYS.ROW_KIND]).toBe('detail');
      expect(r[CASH_FUND_ROW_KEYS.BOLD]).toBe(0);
      expect(r[CASH_FUND_ROW_KEYS.INDENT_LEVEL]).toBe(0);
    }
    expect(rows[1][CASH_FUND_ROW_KEYS.CATEGORY_ID]).toBe(CASH_FUND_UNCATEGORIZED);
  });

  it('paginates the sorted rows while totals stay the whole set', async () => {
    const { rows, totals, total } = await report.buildData(dto({}, { page: 2, limit: 2 }), actor);
    expect(names(rows)).toEqual(['Tiền nước']);
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
      expect(params).toEqual(['org-1', null, '2026-09-01', '2026-09-30']);
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
