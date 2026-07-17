import { BUSINESS_RESULTS_LINE_KEYS } from '@erp/shared-interfaces';
import {
  BusinessResultsRawValues,
  buildBusinessResultsRows,
  computeBusinessResultsPeriod,
  OtherLineCategory,
} from './business-results.aggregator';

const raw = (over: Partial<BusinessResultsRawValues> = {}): BusinessResultsRawValues => ({
  goodsSoldOut: 0,
  goodsReturnedIn: 0,
  promoOnSaleOut: 0,
  promoOnReturnIn: 0,
  otherIncomeByCategory: {},
  otherIncomeUncategorized: 0,
  cogsOut: 0,
  cogsReturnedIn: 0,
  otherExpenseByCategory: {},
  otherExpenseUncategorized: 0,
  ...over,
});

describe('computeBusinessResultsPeriod', () => {
  it('matches the reference "kỳ hiện tại" mock exactly', () => {
    // Reverse-engineered from the confirmed reference UI screenshot.
    const out = computeBusinessResultsPeriod(
      raw({
        goodsSoldOut: 43900000,
        goodsReturnedIn: 1200000,
        promoOnSaleOut: 10440000,
        promoOnReturnIn: 0,
        cogsOut: 2244000,
        cogsReturnedIn: 528000,
      }),
    );
    expect(out[BUSINESS_RESULTS_LINE_KEYS.SALES_VOLUME]).toBe(33460000); // I
    expect(out[BUSINESS_RESULTS_LINE_KEYS.REVENUE]).toBe(32260000); // II
    expect(out[BUSINESS_RESULTS_LINE_KEYS.SALES_REVENUE]).toBe(32260000); // 2.1
    expect(out[BUSINESS_RESULTS_LINE_KEYS.GOODS_REVENUE]).toBe(42700000); // 2.1.1
    expect(out[BUSINESS_RESULTS_LINE_KEYS.PROMO]).toBe(10440000); // 2.1.3
    expect(out[BUSINESS_RESULTS_LINE_KEYS.COGS]).toBe(1716000); // 3.1
    expect(out[BUSINESS_RESULTS_LINE_KEYS.COGS_RETURNED_IN]).toBe(-528000); // 3.1.2 — stored negative
    expect(out[BUSINESS_RESULTS_LINE_KEYS.EXPENSE]).toBe(1716000); // III
    expect(out[BUSINESS_RESULTS_LINE_KEYS.PROFIT]).toBe(30544000); // IV = II - III
  });

  it('hard-codes fee (2.1.2) to 0 (no backing data source yet)', () => {
    const out = computeBusinessResultsPeriod(raw());
    expect(out[BUSINESS_RESULTS_LINE_KEYS.FEE]).toBe(0);
  });

  it('2.2 (Thu khác) sums every category amount plus the uncategorized bucket, and feeds into Doanh thu (II)', () => {
    const out = computeBusinessResultsPeriod(
      raw({
        goodsSoldOut: 100000,
        otherIncomeByCategory: { catA: 30000, catB: 20000 },
        otherIncomeUncategorized: 5000,
      }),
    );
    expect(out[BUSINESS_RESULTS_LINE_KEYS.OTHER_INCOME]).toBe(55000);
    expect(out[BUSINESS_RESULTS_LINE_KEYS.REVENUE]).toBe(155000); // II = 2.1 (100000) + 2.2 (55000)
  });

  it('3.2 (Chi phí khác) sums every category amount plus the uncategorized bucket', () => {
    const out = computeBusinessResultsPeriod(
      raw({ otherExpenseByCategory: { catA: 30000, catB: 20000 }, otherExpenseUncategorized: 5000 }),
    );
    expect(out[BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_GROUP]).toBe(55000);
    expect(out[BUSINESS_RESULTS_LINE_KEYS.EXPENSE]).toBe(55000);
  });

  it('returns null ratios (3.3/3.4) when revenue (II) is 0, instead of dividing by zero', () => {
    const out = computeBusinessResultsPeriod(raw());
    expect(out[BUSINESS_RESULTS_LINE_KEYS.COGS_TO_REVENUE_RATIO]).toBeNull();
    expect(out[BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_TO_REVENUE_RATIO]).toBeNull();
  });
});

describe('buildBusinessResultsRows — 2.2 dynamic category rows', () => {
  const incomeCategories: OtherLineCategory[] = [
    { id: 'cat-rent-income', name: 'Thu cho thuê mặt bằng', displayOrder: 10 },
    { id: 'cat-other-income', name: 'Thu khác', displayOrder: 20 }, // the THU_KHAC category itself
  ];

  it('emits one row per category (numbered 2.2.1..2.2.N) plus a final uncategorized "Thu khác" row', () => {
    const previousRaw = raw();
    const currentRaw = raw({
      otherIncomeByCategory: { 'cat-rent-income': 100000, 'cat-other-income': 20000 },
      otherIncomeUncategorized: 5000,
    });
    const rows = buildBusinessResultsRows(previousRaw, currentRaw, incomeCategories, []);

    const rentRow = rows.find((r) => r.khoanMuc === '2.2.1 Thu cho thuê mặt bằng')!;
    expect(rentRow.kyHienTai).toBe(100000);

    // A line explicitly categorized "Thu khác" (THU_KHAC) counts toward ITS OWN
    // category row (2.2.2), separate from the uncategorized bucket.
    const namedThuKhacRow = rows.find((r) => r.khoanMuc === '2.2.2 Thu khác')!;
    expect(namedThuKhacRow.kyHienTai).toBe(20000);

    // Uncategorized lines (no category selected) get their own final row.
    const uncategorizedRow = rows.find((r) => r.khoanMuc === '2.2.3 Thu khác')!;
    expect(uncategorizedRow.kyHienTai).toBe(5000);

    // 2.2 total = 100000 + 20000 + 5000.
    const groupRow = rows.find((r) => r.khoanMuc === '2.2. Thu khác')!;
    expect(groupRow.kyHienTai).toBe(125000);
  });

  it('places the dynamic rows immediately after "2.2. Thu khác" and before "III."', () => {
    const rows = buildBusinessResultsRows(raw(), raw(), incomeCategories, []);
    const labels = rows.map((r) => r.khoanMuc);
    const groupIdx = labels.indexOf('2.2. Thu khác');
    expect(labels[groupIdx + 1]).toBe('2.2.1 Thu cho thuê mặt bằng');
    expect(labels[groupIdx + 2]).toBe('2.2.2 Thu khác');
    expect(labels[groupIdx + 3]).toBe('2.2.3 Thu khác');
    expect(labels[groupIdx + 4]).toMatch(/^III\./);
  });

  it('with no IN categories configured, still emits the uncategorized "Thu khác" row as 2.2.1', () => {
    const rows = buildBusinessResultsRows(raw(), raw({ otherIncomeUncategorized: 7000 }), [], []);
    const row = rows.find((r) => r.khoanMuc === '2.2.1 Thu khác')!;
    expect(row.kyHienTai).toBe(7000);
  });

  it('keeps 2.2 and 3.2 dynamic rows independent of each other', () => {
    const expenseCategories: OtherLineCategory[] = [
      { id: 'cat-rent-expense', name: 'Tiền thuê cửa hàng', displayOrder: 10 },
    ];
    const rows = buildBusinessResultsRows(
      raw(),
      raw({
        otherIncomeByCategory: { 'cat-rent-income': 100000 },
        otherExpenseByCategory: { 'cat-rent-expense': 40000 },
      }),
      incomeCategories,
      expenseCategories,
    );
    const incomeRow = rows.find((r) => r.khoanMuc === '2.2.1 Thu cho thuê mặt bằng')!;
    const expenseRow = rows.find((r) => r.khoanMuc === '3.2.1 Tiền thuê cửa hàng')!;
    expect(incomeRow.kyHienTai).toBe(100000);
    expect(expenseRow.kyHienTai).toBe(40000);
  });
});

describe('buildBusinessResultsRows — 3.2 dynamic category rows', () => {
  const categories: OtherLineCategory[] = [
    { id: 'cat-rent', name: 'Tiền thuê cửa hàng', displayOrder: 10 },
    { id: 'cat-other', name: 'Chi khác', displayOrder: 20 }, // the CHI_KHAC category itself
  ];

  it('emits one row per category (numbered 3.2.1..3.2.N) plus a final uncategorized "Chi khác" row', () => {
    const previousRaw = raw();
    const currentRaw = raw({
      otherExpenseByCategory: { 'cat-rent': 100000, 'cat-other': 20000 },
      otherExpenseUncategorized: 5000,
    });
    const rows = buildBusinessResultsRows(previousRaw, currentRaw, [], categories);

    const rentRow = rows.find((r) => r.khoanMuc === '3.2.1 Tiền thuê cửa hàng')!;
    expect(rentRow.kyHienTai).toBe(100000);

    // A line explicitly categorized "Chi khác" (CHI_KHAC) counts toward ITS OWN
    // category row (3.2.2), separate from the uncategorized bucket.
    const namedChiKhacRow = rows.find((r) => r.khoanMuc === '3.2.2 Chi khác')!;
    expect(namedChiKhacRow.kyHienTai).toBe(20000);

    // Uncategorized lines (no category selected) get their own final row.
    const uncategorizedRow = rows.find((r) => r.khoanMuc === '3.2.3 Chi khác')!;
    expect(uncategorizedRow.kyHienTai).toBe(5000);

    // 3.2 total = 100000 + 20000 + 5000.
    const groupRow = rows.find((r) => r.khoanMuc === '3.2. Chi phí khác')!;
    expect(groupRow.kyHienTai).toBe(125000);
  });

  it('places the dynamic rows immediately after "3.2. Chi phí khác" and before "3.3."', () => {
    const rows = buildBusinessResultsRows(raw(), raw(), [], categories);
    const labels = rows.map((r) => r.khoanMuc);
    const groupIdx = labels.indexOf('3.2. Chi phí khác');
    expect(labels[groupIdx + 1]).toBe('3.2.1 Tiền thuê cửa hàng');
    expect(labels[groupIdx + 2]).toBe('3.2.2 Chi khác');
    expect(labels[groupIdx + 3]).toBe('3.2.3 Chi khác');
    expect(labels[groupIdx + 4]).toMatch(/^3\.3\./);
  });

  it('with no OUT categories configured, still emits the uncategorized "Chi khác" row as 3.2.1', () => {
    const rows = buildBusinessResultsRows(
      raw(),
      raw({ otherExpenseUncategorized: 7000 }),
      [],
      [],
    );
    const row = rows.find((r) => r.khoanMuc === '3.2.1 Chi khác')!;
    expect(row.kyHienTai).toBe(7000);
  });

  it('indents dynamic rows at level 2 (same as 3.1.1/3.1.2) and never bolds them', () => {
    const rows = buildBusinessResultsRows(raw(), raw(), [], categories);
    const rentRow = rows.find((r) => r.khoanMuc === '3.2.1 Tiền thuê cửa hàng')!;
    expect(rentRow.indentLevel).toBe(2);
    expect(rentRow.bold).toBe(0);
  });

  it('computes thayDoiPercent/thayDoiSoTien per dynamic row across periods', () => {
    const previousRaw = raw({ otherExpenseByCategory: { 'cat-rent': 100000 } });
    const currentRaw = raw({ otherExpenseByCategory: { 'cat-rent': 150000 } });
    const rows = buildBusinessResultsRows(previousRaw, currentRaw, [], categories);
    const rentRow = rows.find((r) => r.khoanMuc === '3.2.1 Tiền thuê cửa hàng')!;
    expect(rentRow.kyTruoc).toBe(100000);
    expect(rentRow.kyHienTai).toBe(150000);
    expect(rentRow.thayDoiPercent).toBe(50);
    expect(rentRow.thayDoiSoTien).toBe(50000);
  });
});

describe('buildBusinessResultsRows — fixed lines', () => {
  it('computes thayDoiPercent/thayDoiSoTien per line and returns all fixed lines in order', () => {
    const previous = raw();
    const current = raw({
      goodsSoldOut: 43900000,
      goodsReturnedIn: 1200000,
      promoOnSaleOut: 10440000,
      cogsOut: 2244000,
      cogsReturnedIn: 528000,
    });
    const rows = buildBusinessResultsRows(previous, current, [], []);

    const profitRow = rows.find((r) => r.khoanMuc === 'IV. Lợi nhuận (II-III)')!;
    expect(profitRow.kyTruoc).toBe(0);
    expect(profitRow.kyHienTai).toBe(30544000);
    expect(profitRow.thayDoiSoTien).toBe(30544000);
    // thayDoiPercent must be null (not Infinity/NaN) when kyTruoc = 0.
    expect(profitRow.thayDoiPercent).toBeNull();
    expect(profitRow.bold).toBe(1);
    expect(profitRow.indentLevel).toBe(0);
  });

  it('computes a non-null thayDoiPercent when kyTruoc is non-zero', () => {
    const previous = raw({ goodsSoldOut: 100000 });
    const current = raw({ goodsSoldOut: 150000 });
    const rows = buildBusinessResultsRows(previous, current, [], []);
    const salesVolumeRow = rows.find((r) => r.khoanMuc?.toString().startsWith('I.'))!;
    expect(salesVolumeRow.kyTruoc).toBe(100000);
    expect(salesVolumeRow.kyHienTai).toBe(150000);
    expect(salesVolumeRow.thayDoiPercent).toBe(50);
  });
});
