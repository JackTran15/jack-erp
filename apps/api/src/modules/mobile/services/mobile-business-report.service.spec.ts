import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchService } from '../../branch/branch.service';
import {
  BUSINESS_CHART_MONTHS,
  chartMonthsOf,
  chartWindowOf,
  MobileBusinessReportService,
} from './mobile-business-report.service';

const BRANCH_A = '20000000-0000-4000-8000-000000000001';
const BRANCH_B = '20000000-0000-4000-8000-000000000002';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  branchIds: [BRANCH_A, BRANCH_B],
  roles: [],
};

const myBranches = [
  { id: BRANCH_A, name: 'Cửa hàng A', address: '1 Lê Lợi' },
  { id: BRANCH_B, name: 'Cửa hàng B', address: null },
];

/**
 * Truy vấn chạy bằng SQL thô, nên phần kiểm được mà KHÔNG cần Postgres là
 * chính câu lệnh (phạm vi chi nhánh, tham số bind) và phần ghép trong TS
 * (tổng kỳ, cửa sổ tháng, thứ tự). Cùng giới hạn đã ghi ở
 * `mobile-inventory.service.spec.ts`.
 */
describe('MobileBusinessReportService', () => {
  let service: MobileBusinessReportService;
  let query: jest.Mock;
  let listMyBranches: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);
    listMyBranches = jest.fn().mockResolvedValue(myBranches);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileBusinessReportService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: BranchService, useValue: { listMyBranches } },
      ],
    }).compile();

    service = module.get(MobileBusinessReportService);
  });

  const range = { from: '2026-09-01', to: '2026-09-30' };

  describe('phạm vi chi nhánh', () => {
    it('chỉ chi nhánh được phân công, bind mảng ở $4', async () => {
      await service.getReport(range, actor);

      // Hai lượt truy vấn ô (kỳ + cửa sổ), KHÔNG có lượt đọc bảng branches.
      expect(query).toHaveBeenCalledTimes(2);
      for (const [sql, params] of query.mock.calls) {
        expect(sql).toContain('= ANY($4::text[])');
        expect(params[0]).toBe('org-1');
        expect(params[3]).toEqual([BRANCH_A, BRANCH_B]);
      }
    });

    it('KHÔNG đọc bảng branches — khung là listMyBranches, mobile không có vế hợp nhất', async () => {
      await service.getReport(range, actor);

      expect(listMyBranches).toHaveBeenCalledTimes(1);
      for (const [sql] of query.mock.calls) expect(sql).not.toContain('FROM branches\n');
    });

    it('không phân công → 403, không lặng lẽ trả rỗng', async () => {
      listMyBranches.mockResolvedValue([]);

      await expect(service.getReport(range, actor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('khoảng ngày', () => {
    it('lượt 1 bind đúng kỳ, lượt 2 bind cửa sổ 7 tháng kết thúc ở tháng của `to`', async () => {
      await service.getReport({ from: '2026-09-10', to: '2026-09-20' }, actor);

      expect(query.mock.calls[0][1].slice(1, 3)).toEqual(['2026-09-10', '2026-09-20']);
      expect(query.mock.calls[1][1].slice(1, 3)).toEqual(['2026-03-01', '2026-09-30']);
    });

    it('cửa sổ cuộn qua năm và ra đúng ngày cuối tháng', () => {
      expect(chartWindowOf('2026-02-15')).toEqual({ from: '2025-08-01', to: '2026-02-28' });
      expect(chartWindowOf('2028-02-01')).toEqual({ from: '2027-08-01', to: '2028-02-29' });
      expect(chartMonthsOf('2026-02-15')).toEqual([
        { year: 2025, month: 8 },
        { year: 2025, month: 9 },
        { year: 2025, month: 10 },
        { year: 2025, month: 11 },
        { year: 2025, month: 12 },
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
      ]);
      expect(chartMonthsOf('2026-02-15')).toHaveLength(BUSINESS_CHART_MONTHS);
    });
  });

  describe('ghép kết quả', () => {
    it('tổng kỳ cộng mọi ô của chi nhánh; tháng vắng = 0; profit = revenue − cost', async () => {
      query
        // lượt 1: kỳ — chi nhánh A có hai ô (kỳ cắt qua hai tháng), B không phát sinh
        .mockResolvedValueOnce([
          { branchId: BRANCH_A, year: 2026, month: 8, revenue: 100, cost: 40 },
          { branchId: BRANCH_A, year: 2026, month: 9, revenue: 50, cost: 30 },
        ])
        // lượt 2: cửa sổ — chỉ hai tháng có số
        .mockResolvedValueOnce([
          { branchId: BRANCH_A, year: 2026, month: 9, revenue: 50, cost: 30 },
          { branchId: BRANCH_B, year: 2026, month: 4, revenue: 7, cost: 9 },
        ]);

      const result = await service.getReport({ from: '2026-08-20', to: '2026-09-05' }, actor);

      const a = result.branches.find((b) => b.id === BRANCH_A)!;
      expect(a).toEqual(expect.objectContaining({ revenue: 150, cost: 70, profit: 80, address: '1 Lê Lợi' }));
      expect(a.months).toHaveLength(BUSINESS_CHART_MONTHS);
      expect(a.months.map((m) => m.month)).toEqual([3, 4, 5, 6, 7, 8, 9]);
      expect(a.months.at(-1)).toEqual({ year: 2026, month: 9, revenue: 50, cost: 30, profit: 20 });
      expect(a.months[0]).toEqual({ year: 2026, month: 3, revenue: 0, cost: 0, profit: 0 });

      const b = result.branches.find((x) => x.id === BRANCH_B)!;
      // Chi nhánh không phát sinh trong kỳ vẫn có mặt, địa chỉ null → ''.
      expect(b).toEqual(expect.objectContaining({ revenue: 0, cost: 0, profit: 0, address: '' }));
      expect(b.months[1]).toEqual({ year: 2026, month: 4, revenue: 7, cost: 9, profit: -2 });

      // Tổng do server chốt = Σ chi nhánh.
      expect(result.totals).toEqual({ revenue: 150, cost: 70, profit: 80 });
    });

    it('sắp theo doanh thu giảm dần, cùng doanh thu thì theo tên', async () => {
      listMyBranches.mockResolvedValue([
        { id: 'c', name: 'Cửa hàng C', address: '' },
        { id: 'a', name: 'Cửa hàng A', address: '' },
        { id: 'b', name: 'Cửa hàng B', address: '' },
      ]);
      query
        .mockResolvedValueOnce([
          { branchId: 'b', year: 2026, month: 9, revenue: 10, cost: 0 },
          { branchId: 'c', year: 2026, month: 9, revenue: 5, cost: 0 },
          { branchId: 'a', year: 2026, month: 9, revenue: 5, cost: 0 },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getReport(range, actor);

      expect(result.branches.map((b) => b.id)).toEqual(['b', 'a', 'c']);
    });

    it('ô có branchId ngoài phạm vi (NULL) bị bỏ qua, không rơi vào tổng', async () => {
      listMyBranches.mockResolvedValue([{ id: BRANCH_A, name: 'A', address: '' }]);
      query
        .mockResolvedValueOnce([
          { branchId: null, year: 2026, month: 9, revenue: 999, cost: 0 },
          { branchId: BRANCH_A, year: 2026, month: 9, revenue: 1, cost: 0 },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getReport(range, actor);

      expect(result.totals.revenue).toBe(1);
    });
  });
});
