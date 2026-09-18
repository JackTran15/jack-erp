import { DataSource } from 'typeorm';
import { CashFundPeriodService } from './cash-fund-period.service';
import {
  fixedBucketPredicate,
  voucherHeaderWhere,
  voucherHeadersSql,
  voucherLinesSql,
} from './cash-fund-voucher.sql';

const ORG = 'org-1';
const scope = (branchIds: string[] | null) => ({ organizationId: ORG, branchIds });

describe('cash-fund voucher SQL', () => {
  it('reads only posted, undeleted, non-reversal vouchers of the organization', () => {
    const where = voucherHeaderWhere('h');
    expect(where).toContain('h.organization_id = $1');
    expect(where).toContain("h.status = 'POSTED'");
    expect(where).toContain('h.deleted_at IS NULL');
    expect(where).toContain("h.reference_type::text <> 'REVERSAL'");
    // NULL branch array = consolidated: no branch predicate bites.
    expect(where).toContain('($2::text[] IS NULL OR h.branch_id = ANY($2::text[]))');
  });

  it('unions the four voucher tables on the voucher date, never posted_at or created_at', () => {
    const sql = voucherHeadersSql();
    for (const t of ['cash_receipts', 'cash_payments', 'bank_receipts', 'bank_payments']) {
      expect(sql).toContain(`FROM ${t} h`);
    }
    expect(sql).toContain('h.voucher_date::date AS doc_date');
    expect(sql).toContain('h.doc_date::date AS doc_date');
    expect(sql).not.toMatch(/posted_at|created_at/);
    expect(sql.split('UNION ALL')).toHaveLength(4);
  });

  it('joins lines back to their posted header with the same predicate', () => {
    const sql = voucherLinesSql();
    expect(sql).toContain('FROM cash_receipt_lines l');
    expect(sql).toContain('JOIN cash_receipts h ON h.id = l.cash_receipt_id');
    expect(sql).toContain('JOIN bank_payments h ON h.id = l.bank_payment_id');
    expect(sql).toContain("h.status = 'POSTED'");
  });

  it('buckets sales receipts and purchase payments by purpose (A-02)', () => {
    const p = fixedBucketPredicate('v');
    expect(p).toContain("v.direction = 'in' AND v.purpose IN ('POS_SALE', 'DEBT_COLLECTION')");
    expect(p).toContain("v.direction = 'out' AND v.purpose IN ('PURCHASE', 'SUPPLIER_PAYMENT')");
  });
});

describe('CashFundPeriodService', () => {
  let query: jest.Mock;
  let service: CashFundPeriodService;

  beforeEach(() => {
    query = jest.fn();
    service = new CashFundPeriodService({ query } as unknown as DataSource);
  });

  describe('openingBalance', () => {
    it('sums signed vouchers before `from` per fund and adds the deposit opening balances', async () => {
      query
        .mockResolvedValueOnce([
          { fund: 'cash', signed: '500000.00' },
          { fund: 'deposit', signed: '-250000.00' },
        ])
        .mockResolvedValueOnce([{ opening: '1000000.00' }]);

      const opening = await service.openingBalance(scope(['b-a']), '2026-09-01');

      expect(opening).toEqual({ cash: 500000, deposit: 750000 });
      const [voucherSql, voucherParams] = query.mock.calls[0] as [string, unknown[]];
      expect(voucherSql).toContain('v.doc_date < $3::date');
      expect(voucherSql).toContain("CASE WHEN v.direction = 'in' THEN v.total_amount ELSE -v.total_amount END");
      expect(voucherParams).toEqual([ORG, ['b-a'], '2026-09-01']);
      const [depositSql, depositParams] = query.mock.calls[1] as [string, unknown[]];
      expect(depositSql).toContain('FROM deposit_accounts a');
      expect(depositSql).toContain('a.deleted_at IS NULL');
      expect(depositParams).toEqual([ORG, ['b-a']]);
    });

    it('is zero for a fund with no history and passes NULL for a consolidated scope', async () => {
      query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ opening: null }]);
      const opening = await service.openingBalance(scope(null), '2025-01-01');
      expect(opening).toEqual({ cash: 0, deposit: 0 });
      expect((query.mock.calls[0] as unknown[])[1]).toEqual([ORG, null, '2025-01-01']);
    });
  });

  describe('periodTotals', () => {
    it('keeps II and III equal to what the vouchers moved: fixed buckets from headers, the rest by category with the remainder uncategorised', async () => {
      query
        // headers: (fund, direction, bucket, amount)
        .mockResolvedValueOnce([
          { fund: 'cash', direction: 'in', bucket: 'fixed', amount: '1000000' },
          { fund: 'deposit', direction: 'in', bucket: 'fixed', amount: '1600000' },
          { fund: 'cash', direction: 'in', bucket: 'other', amount: '70000' },
          { fund: 'cash', direction: 'out', bucket: 'fixed', amount: '200000' },
          { fund: 'cash', direction: 'out', bucket: 'other', amount: '200000' },
        ])
        // categorised lines of the "other" headers
        .mockResolvedValueOnce([
          { fund: 'cash', direction: 'in', category_id: 'cat-interest', amount: '50000' },
          { fund: 'cash', direction: 'out', category_id: 'cat-electric', amount: '150000' },
          { fund: 'cash', direction: 'out', category_id: 'cat-water', amount: '10000' },
        ]);

      const t = await service.periodTotals(scope(['b-a']), '2026-09-01', '2026-09-30');

      expect(t.inSales).toEqual({ cash: 1000000, deposit: 1600000 });
      expect(t.outPurchase).toEqual({ cash: 200000, deposit: 0 });
      expect(t.inByCategory).toEqual({ 'cat-interest': { cash: 50000, deposit: 0 } });
      // 70.000 of "other" receipts, 50.000 of it categorised → 20.000 "Thu khác".
      expect(t.inUncategorized).toEqual({ cash: 20000, deposit: 0 });
      expect(t.outByCategory).toEqual({
        'cat-electric': { cash: 150000, deposit: 0 },
        'cat-water': { cash: 10000, deposit: 0 },
      });
      // 200.000 of "other" payments, 160.000 categorised → 40.000 "Chi khác" (the refund).
      expect(t.outUncategorized).toEqual({ cash: 40000, deposit: 0 });

      const [headerSql, headerParams] = query.mock.calls[0] as [string, unknown[]];
      expect(headerSql).toContain('v.doc_date >= $3::date AND v.doc_date <= $4::date');
      expect(headerParams).toEqual([ORG, ['b-a'], '2026-09-01', '2026-09-30']);
      const [lineSql] = query.mock.calls[1] as [string, unknown[]];
      expect(lineSql).toContain('v.category_id IS NOT NULL');
      expect(lineSql).toContain('AND NOT ((v.direction');
    });

    it('rounds to the cent and never goes negative on uncategorised when lines and header agree', async () => {
      query
        .mockResolvedValueOnce([{ fund: 'cash', direction: 'out', bucket: 'other', amount: '100.005' }])
        .mockResolvedValueOnce([
          { fund: 'cash', direction: 'out', category_id: 'c1', amount: '100.005' },
        ]);
      const t = await service.periodTotals(scope(null), '2026-09-01', '2026-09-30');
      expect(t.outByCategory.c1).toEqual({ cash: 100.01, deposit: 0 });
      expect(t.outUncategorized).toEqual({ cash: 0, deposit: 0 });
    });
  });

  describe('categories', () => {
    it('returns every category of the organization in display order, deleted ones included', async () => {
      query.mockResolvedValueOnce([
        { id: 'c2', code: 'DIEN', name: 'Tiền điện', direction: 'OUT', display_order: '2', is_active: true, deleted_at: null },
        { id: 'c9', code: 'OLD', name: 'Mục cũ', direction: 'OUT', display_order: '9', is_active: false, deleted_at: '2026-01-01' },
      ]);
      const rows = await service.categories(ORG);
      expect(rows).toEqual([
        { id: 'c2', code: 'DIEN', name: 'Tiền điện', direction: 'OUT', displayOrder: 2, isActive: true, deletedAt: null },
        { id: 'c9', code: 'OLD', name: 'Mục cũ', direction: 'OUT', displayOrder: 9, isActive: false, deletedAt: '2026-01-01' },
      ]);
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toContain('deleted_at IS NULL');
      expect(sql).toContain('ORDER BY c.display_order ASC, c.name ASC');
      expect(params).toEqual([ORG]);
    });
  });
});
