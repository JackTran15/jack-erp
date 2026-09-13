import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileCustomerOrder } from '../dto/mobile-customer-list.query.dto';
import { MobileCustomerDebtSort } from '../dto/mobile-debt-report.query.dto';
import { MobileDebtReportService } from './mobile-debt-report.service';

const BRANCH_A = '20000000-0000-4000-8000-000000000001';
const BRANCH_B = '20000000-0000-4000-8000-000000000002';
const BRANCH_C = '20000000-0000-4000-8000-000000000003';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  branchIds: [BRANCH_A, BRANCH_B],
  roles: [],
};

const base = {
  from: '2026-09-01',
  to: '2026-09-30',
  sort: MobileCustomerDebtSort.NAME,
  order: MobileCustomerOrder.ASC,
  page: 1,
  limit: 20,
};

/**
 * Truy vấn chạy bằng SQL thô, nên phần kiểm được mà KHÔNG cần Postgres là
 * chính câu lệnh (bốn nguồn, mốc kỳ, phạm vi chi nhánh, tìm kiếm, sắp xếp,
 * tham số bind) và phần ghép trong TS (envelope, làm tròn). Cùng giới hạn đã
 * ghi ở `mobile-revenue-report.service.spec.ts`.
 */
describe('MobileDebtReportService', () => {
  let service: MobileDebtReportService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileDebtReportService,
        { provide: getDataSourceToken(), useValue: { query } },
      ],
    }).compile();

    service = module.get(MobileDebtReportService);
  });

  describe('công thức khớp web customer-debts', () => {
    it('gộp đủ BỐN nguồn ở CẢ hai câu, giảm mang dấu âm, closing = Σ opening + Σ period', async () => {
      await service.listCustomers(base, actor);

      expect(query).toHaveBeenCalledTimes(2);
      for (const [sql] of query.mock.calls) {
        expect(sql).toContain('FROM invoice_debts d');
        expect(sql).toContain('JOIN invoice_debts d ON d.id = p.debt_id');
        expect(sql).toContain('FROM receivables r');
        expect(sql).toContain('JOIN receivables r ON r.id = s.receivable_id');
        expect(sql).toContain('-(CASE WHEN p.paid_at');
        expect(sql).toContain('-(CASE WHEN s.settlement_date');
        expect(sql).toContain('(SUM(opening) + SUM(period))::float AS closing');
        expect(sql).toContain(
          `r.status::text IN ('POSTED', 'PARTIALLY_SETTLED', 'SETTLED', 'WRITTEN_OFF')`,
        );
      }
    });

    it('đầu kỳ so `< $2::date` ở cả bốn nguồn; cột date `<= $3::date`, cột timestamptz trọn ngày cuối', async () => {
      await service.listCustomers(base, actor);

      const [sql, params] = query.mock.calls[0];
      expect(params[1]).toBe('2026-09-01');
      expect(params[2]).toBe('2026-09-30');
      expect(sql.match(/<\s+\$2::date/g)).toHaveLength(4);
      // date
      expect(sql).toContain('d.issued_at <= $3::date');
      expect(sql).toContain('s.settlement_date <= $3::date');
      // timestamptz — KHÔNG `<= $3::date` (đó là lỗi biên của web)
      expect(sql).toContain(`p.paid_at < ($3::date + INTERVAL '1 day')`);
      expect(sql).toContain(`r.posted_at < ($3::date + INTERVAL '1 day')`);
      expect(sql).not.toContain('p.paid_at <= $3');
      expect(sql).not.toContain('r.posted_at <= $3');
    });

    it('phía GIẢM lọc chi nhánh theo nợ/receivable GỐC, không theo nơi thu', async () => {
      await service.listCustomers(base, actor);

      const [sql] = query.mock.calls[0];
      expect(sql.match(/d\.branch_id = ANY\(\$4::text\[\]\)/g)).toHaveLength(2);
      expect(sql.match(/r\.branch_id = ANY\(\$4::text\[\]\)/g)).toHaveLength(2);
      expect(sql).not.toContain('p.branch_id');
      expect(sql).not.toContain('s.branch_id');
    });

    it('luôn loại khách đã gộp và luôn khoá tổ chức ở $1', async () => {
      await service.listCustomers(base, actor);

      for (const [sql, params] of query.mock.calls) {
        expect(params[0]).toBe('org-1');
        expect(sql).toContain(`c.status::text <> 'MERGED'`);
        expect(sql).toContain('c.organization_id = $1');
      }
    });
  });

  describe('phạm vi chi nhánh = tập phân công', () => {
    it('vắng branchIds → bind trọn tập phân công vào $4', async () => {
      await service.listCustomers(base, actor);

      for (const [, params] of query.mock.calls) {
        expect(params[3]).toEqual([BRANCH_A, BRANCH_B]);
      }
    });

    it('xin đúng một chi nhánh được phân công → chỉ chi nhánh đó', async () => {
      await service.listCustomers({ ...base, branchIds: [BRANCH_B] }, actor);

      expect(query.mock.calls[0][1][3]).toEqual([BRANCH_B]);
    });

    it('xin chi nhánh ngoài phân công → 403, KHÔNG chạm DB', async () => {
      await expect(
        service.listCustomers({ ...base, branchIds: [BRANCH_C] }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });

    it('không được phân công chi nhánh nào → 403', async () => {
      await expect(
        service.listCustomers(base, { ...actor, branchIds: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('tìm kiếm', () => {
    it('ba vế OR trong MỘT cặp ngoặc, escape ký tự LIKE, và câu đếm cùng WHERE', async () => {
      await service.listCustomers({ ...base, search: ' 50%_a ' }, actor);

      const [dataSql, dataParams] = query.mock.calls[0];
      const [countSql, countParams] = query.mock.calls[1];
      const clause = `(c.code ILIKE $5 OR c.name ILIKE $5 OR COALESCE(c.phone, '') ILIKE $5)`;
      expect(dataSql).toContain(clause);
      expect(countSql).toContain(clause);
      expect(dataParams[4]).toBe('%50\\%\\_a%');
      expect(countParams).toEqual(dataParams.slice(0, 5));
      expect(dataSql).toContain('LIMIT $6 OFFSET $7');
      expect(countSql).not.toContain('LIMIT');
    });

    it('từ khoá rỗng/toàn khoảng trắng → không có ILIKE, LIMIT về $5', async () => {
      await service.listCustomers({ ...base, search: '   ' }, actor);

      const [sql, params] = query.mock.calls[0];
      expect(sql).not.toContain('ILIKE');
      expect(sql).toContain('LIMIT $5 OFFSET $6');
      expect(params).toHaveLength(6);
    });
  });

  describe('sắp xếp', () => {
    it.each([
      [MobileCustomerDebtSort.NAME, MobileCustomerOrder.ASC, 'lower(c.name) ASC, c.id ASC'],
      [MobileCustomerDebtSort.NAME, MobileCustomerOrder.DESC, 'lower(c.name) DESC, c.id ASC'],
      [MobileCustomerDebtSort.DEBT, MobileCustomerOrder.ASC, 'b.closing ASC, lower(c.name) ASC, c.id ASC'],
      [MobileCustomerDebtSort.DEBT, MobileCustomerOrder.DESC, 'b.closing DESC, lower(c.name) ASC, c.id ASC'],
    ])('%s %s → ORDER BY whitelist, luôn kết bằng c.id', async (sort, order, expected) => {
      await service.listCustomers({ ...base, sort, order }, actor);

      expect(query.mock.calls[0][0]).toContain(`ORDER BY ${expected}`);
    });
  });

  describe('phân trang + envelope', () => {
    it('offset = (page − 1) × limit; trả total/totalClosing từ câu đếm, làm tròn 2 số', async () => {
      query
        .mockResolvedValueOnce([
          { id: 'c1', code: 'KH1', name: 'A', closing: 1000.005 },
          { id: 'c2', code: 'KH2', name: 'B', closing: -250 },
        ])
        .mockResolvedValueOnce([{ total: 7, totalClosing: 0.1 + 0.2 }]);

      const result = await service.listCustomers({ ...base, page: 3, limit: 5 }, actor);

      expect(query.mock.calls[0][1].slice(-2)).toEqual([5, 10]);
      expect(result).toEqual({
        data: [
          { id: 'c1', code: 'KH1', name: 'A', closing: 1000.01 },
          { id: 'c2', code: 'KH2', name: 'B', closing: -250 },
        ],
        total: 7,
        page: 3,
        limit: 5,
        totalClosing: 0.3,
      });
    });

    it('câu đếm trả rỗng → total 0, totalClosing 0', async () => {
      const result = await service.listCustomers(base, actor);

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20, totalClosing: 0 });
    });
  });
});
