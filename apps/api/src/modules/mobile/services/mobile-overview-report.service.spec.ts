import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileOverviewReportService } from './mobile-overview-report.service';

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

const range = { from: '2026-09-01', to: '2026-09-30' };
const compare = { compareFrom: '2026-08-01', compareTo: '2026-08-31' };

/** Câu KHUNG là câu duy nhất không có CTE — phân biệt bằng dấu vết đó. */
const isFrame = (sql: string): boolean => !sql.includes('WITH lines');

/**
 * SQL thô nên phần kiểm được không cần Postgres là chính câu lệnh (công
 * thức mượn của revenue-report, đếm hoá đơn, phạm vi, tham số bind) và phần
 * ghép trong TS (khung + phát sinh, tổng, thứ tự, 400 khi thiếu vế so sánh).
 * Cùng giới hạn đã ghi ở `mobile-revenue-report.service.spec.ts`.
 */
describe('MobileOverviewReportService', () => {
  let service: MobileOverviewReportService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileOverviewReportService,
        { provide: getDataSourceToken(), useValue: { query } },
      ],
    }).compile();

    service = module.get(MobileOverviewReportService);
  });

  describe('câu gộp', () => {
    it('mượn CTE của revenue-report: loại huỷ, dấu theo direction, trừ KM engine, đếm DISTINCT invoice_id', async () => {
      await service.getReport(range, actor);

      const aggregates = query.mock.calls.filter(([sql]) => !isFrame(sql));
      expect(aggregates).toHaveLength(1);
      const [sql, params] = aggregates[0];
      expect(sql).toContain(`i.status <> 'cancelled'`);
      expect(sql).toContain(`WHEN li.direction = 'OUT' THEN 1 ELSE -1 END`);
      expect(sql).toContain('(li.line_total - li.promotion_discount)');
      expect(sql).toContain('COUNT(DISTINCT l.invoice_id)::int');
      expect(sql).toContain('i.issued_at >= $2::date');
      expect(sql).toContain(`i.issued_at < ($3::date + INTERVAL '1 day')`);
      expect(sql).toContain('LEFT JOIN branches b ON b.id::text = l.branch_id');
      expect(params.slice(0, 3)).toEqual(['org-1', '2026-09-01', '2026-09-30']);
    });

    it('không có kỳ so sánh → đúng MỘT câu gộp + một câu khung', async () => {
      await service.getReport(range, actor);
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('có kỳ so sánh → câu gộp chạy HAI lượt với hai khoảng, mỗi lượt tham số riêng', async () => {
      await service.getReport({ ...range, ...compare }, actor);

      const aggregates = query.mock.calls.filter(([sql]) => !isFrame(sql));
      expect(aggregates).toHaveLength(2);
      expect(aggregates[0][1].slice(1, 3)).toEqual(['2026-09-01', '2026-09-30']);
      expect(aggregates[1][1].slice(1, 3)).toEqual(['2026-08-01', '2026-08-31']);
    });
  });

  describe('kỳ so sánh phải đi đôi', () => {
    it('chỉ compareFrom → 400, chưa chạm database', async () => {
      await expect(
        service.getReport({ ...range, compareFrom: '2026-08-01' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('chỉ compareTo → 400', async () => {
      await expect(
        service.getReport({ ...range, compareTo: '2026-08-31' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('phạm vi chi nhánh', () => {
    it('vắng branchIds → bind tập phân công ở cả khung ($3::uuid[]) lẫn gộp ($4::text[])', async () => {
      await service.getReport(range, actor);

      const [frameSql, frameParams] = query.mock.calls.find(([sql]) => isFrame(sql))!;
      expect(frameSql).toContain('AND id = ANY($3::uuid[])');
      expect(frameParams[2]).toEqual([BRANCH_A, BRANCH_B]);

      const [aggSql, aggParams] = query.mock.calls.find(([sql]) => !isFrame(sql))!;
      expect(aggSql).toContain('AND i.branch_id = ANY($4::text[])');
      expect(aggParams[3]).toEqual([BRANCH_A, BRANCH_B]);
    });

    it('không phân công → 403 dù là ai — mobile không có vế hợp nhất', async () => {
      await expect(
        service.getReport(range, { ...actor, branchIds: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });

    it('xin chi nhánh ngoài phân công → 403', async () => {
      await expect(
        service.getReport({ ...range, branchIds: [BRANCH_C] }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('ghép khung + phát sinh', () => {
    it('chi nhánh không phát sinh vẫn có mặt với 0; chi nhánh ngoài khung có phát sinh được nối thêm; totals = Σ', async () => {
      query.mockImplementation((sql: string, params: unknown[]) => {
        if (isFrame(sql)) {
          return Promise.resolve([
            { id: BRANCH_A, name: 'Huế' },
            { id: BRANCH_B, name: 'Cà Mau' },
          ]);
        }
        if (params[1] === '2026-09-01') {
          return Promise.resolve([
            { id: BRANCH_A, name: 'Huế', invoiceCount: 3, revenue: '100.5' },
            { id: BRANCH_C, name: BRANCH_C, invoiceCount: 1, revenue: 20 },
          ]);
        }
        return Promise.resolve([
          { id: BRANCH_B, name: 'Cà Mau', invoiceCount: 2, revenue: 40 },
        ]);
      });

      const result = await service.getReport({ ...range, ...compare }, actor);

      expect(result.branches).toEqual([
        { id: BRANCH_A, name: 'Huế', revenue: 100.5, invoiceCount: 3, compareRevenue: 0 },
        { id: BRANCH_C, name: BRANCH_C, revenue: 20, invoiceCount: 1, compareRevenue: 0 },
        { id: BRANCH_B, name: 'Cà Mau', revenue: 0, invoiceCount: 0, compareRevenue: 40 },
      ]);
      expect(result.totals).toEqual({ revenue: 120.5, invoiceCount: 4, compareRevenue: 40 });
    });

    it('sắp doanh thu giảm dần, hoà thì theo tên', async () => {
      query.mockImplementation((sql: string) =>
        Promise.resolve(
          isFrame(sql)
            ? [
                { id: BRANCH_A, name: 'Zeta' },
                { id: BRANCH_B, name: 'Alpha' },
              ]
            : [],
        ),
      );

      const result = await service.getReport(range, actor);
      expect(result.branches.map((b) => b.name)).toEqual(['Alpha', 'Zeta']);
    });
  });
});
