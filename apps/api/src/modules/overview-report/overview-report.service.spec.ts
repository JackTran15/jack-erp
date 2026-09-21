import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { BranchService } from '../branch/branch.service';
import { MobileRevenueTimeUnit } from '../mobile/dto/mobile-revenue-report.query.dto';
import {
  OverviewShareDimension,
  OverviewTopProductsSortBy,
} from './dto/overview-report.query.dto';
import { OverviewReportService } from './overview-report.service';

const BRANCH_A = '20000000-0000-4000-8000-000000000001';
const BRANCH_B = '20000000-0000-4000-8000-000000000002';
const BRANCH_C = '20000000-0000-4000-8000-000000000003';
const CATEGORY = '30000000-0000-4000-8000-000000000001';
const PRODUCT = '40000000-0000-4000-8000-000000000001';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  branchIds: [BRANCH_A, BRANCH_B],
  roles: [],
};

const range = { from: '2026-09-01', to: '2026-09-30' };

/**
 * SQL thô nên phần kiểm được không cần Postgres là câu lệnh + tham số (phạm
 * vi chi nhánh, bộ lọc, mảnh SQL mobile được dùng lại) và phần ghép trong TS
 * (cộng ô theo chi nhánh / tháng, làm tròn). Cùng giới hạn các spec mobile.
 */
describe('OverviewReportService', () => {
  let service: OverviewReportService;
  let query: jest.Mock;
  let listMyBranches: jest.Mock;

  const sqlAt = (i: number): string => query.mock.calls[i][0] as string;
  const paramsAt = (i: number): unknown[] => query.mock.calls[i][1] as unknown[];

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);
    listMyBranches = jest.fn().mockResolvedValue([
      { id: BRANCH_A, name: 'CH A' },
      { id: BRANCH_B, name: 'CH B' },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OverviewReportService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: BranchService, useValue: { listMyBranches } },
      ],
    }).compile();

    service = module.get(OverviewReportService);
  });

  describe('phạm vi chi nhánh', () => {
    it('vắng branchIds (chế độ chuỗi) = mọi chi nhánh phân công', async () => {
      await service.getRevenueTimeline({ ...range, unit: MobileRevenueTimeUnit.DAY }, actor);
      expect(paramsAt(0)).toEqual(['org-1', range.from, range.to, [BRANCH_A, BRANCH_B]]);
    });

    it('một chi nhánh → đúng id đó', async () => {
      await service.getRevenueTimeline(
        { ...range, unit: MobileRevenueTimeUnit.DAY, branchIds: [BRANCH_B] },
        actor,
      );
      expect(paramsAt(0)[3]).toEqual([BRANCH_B]);
    });

    it('xin chi nhánh ngoài phân công → 403, không chạm DB', async () => {
      await expect(
        service.getRevenueTimeline(
          { ...range, unit: MobileRevenueTimeUnit.DAY, branchIds: [BRANCH_C] },
          actor,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('getDailyActivity', () => {
    it('ghép tiền thu theo phương thức, doanh thu đã/chưa thanh toán, huỷ', async () => {
      query
        .mockResolvedValueOnce([
          { method: 'cash', amount: 100 },
          { method: 'card', amount: 50 },
        ])
        .mockResolvedValueOnce([{ method: 'bank_transfer', amount: 30 }])
        .mockResolvedValueOnce([
          { method: 'cash', amount: 20 },
          { method: 'bank_transfer', amount: 0 },
        ])
        .mockResolvedValueOnce([
          { total: 500, invoiceCount: 4, paidAmount: 300, paidCount: 3, unpaidAmount: 200, unpaidCount: 1 },
        ])
        .mockResolvedValueOnce([{ count: 2, amount: 80 }]);

      const result = await service.getDailyActivity(range, actor);

      expect(result).toEqual({
        cashIn: {
          sales: { cash: 100, card: 50, transfer: 0 },
          debt: { cash: 0, card: 0, transfer: 30 },
          other: { cash: 20, card: 0, transfer: 0 },
        },
        revenue: { total: 500, invoiceCount: 4, paidAmount: 300, paidCount: 3, unpaidAmount: 200, unpaidCount: 1 },
        cancelled: { count: 2, amount: 80 },
      });
      expect(sqlAt(0)).toContain('FROM invoice_payments p');
      expect(sqlAt(1)).toContain('FROM debt_payments d');
      expect(sqlAt(2)).toContain('cash_receipt_lines');
      expect(sqlAt(2)).toContain('r.affect_revenue = true');
      expect(sqlAt(3)).toContain('WITH lines AS');
      expect(sqlAt(4)).toContain(`i.status = 'cancelled'`);
    });
  });

  describe('getRevenueCostProfit', () => {
    it('cộng ô tháng theo chi nhánh; chi nhánh không phát sinh vẫn có cột 0', async () => {
      query.mockResolvedValueOnce([
        { branchId: BRANCH_A, year: 2026, month: 9, revenue: 100, cost: 60 },
        { branchId: BRANCH_A, year: 2026, month: 8, revenue: 50, cost: 70 },
      ]);

      const result = await service.getRevenueCostProfit(range, actor);

      expect(result.stores).toEqual([
        { branchId: BRANCH_A, name: 'CH A', revenue: 150, cost: 130, profit: 20 },
        { branchId: BRANCH_B, name: 'CH B', revenue: 0, cost: 0, profit: 0 },
      ]);
      expect(result.totals).toEqual({ revenue: 150, cost: 130, profit: 20 });
      expect(paramsAt(0)[3]).toEqual([BRANCH_A, BRANCH_B]);
    });

    it('chỉ các chi nhánh đã xin', async () => {
      await service.getRevenueCostProfit({ ...range, branchIds: [BRANCH_B] }, actor);
      expect(paramsAt(0)[3]).toEqual([BRANCH_B]);
    });
  });

  describe('getRevenueCostProfitTimeline', () => {
    it('gộp mọi chi nhánh về mốc đầu tháng, tăng dần', async () => {
      query.mockResolvedValueOnce([
        { branchId: BRANCH_B, year: 2026, month: 2, revenue: 10, cost: 4 },
        { branchId: BRANCH_A, year: 2026, month: 1, revenue: 100, cost: 60 },
        { branchId: BRANCH_B, year: 2026, month: 1, revenue: 20, cost: 70 },
      ]);

      const result = await service.getRevenueCostProfitTimeline(range, actor);

      expect(result.points).toEqual([
        { bucket: '2026-01-01T00:00:00', revenue: 120, cost: 130, profit: -10 },
        { bucket: '2026-02-01T00:00:00', revenue: 10, cost: 4, profit: 6 },
      ]);
    });
  });

  describe('getCashFlow', () => {
    it('chân movement của LEGS_CTE, mốc theo created_at, chỉ trong kỳ', async () => {
      query.mockResolvedValueOnce([{ bucket: '2026-09-01T00:00:00', cashIn: 10, cashOut: 4 }]);

      const result = await service.getCashFlow({ ...range, unit: MobileRevenueTimeUnit.DAY }, actor);

      expect(result.points).toEqual([{ bucket: '2026-09-01T00:00:00', cashIn: 10, cashOut: 4 }]);
      expect(sqlAt(0)).toContain('FROM cash_movements m');
      expect(sqlAt(0)).toContain('created_at AS issued_at FROM legs WHERE created_at >= $2::date');
    });
  });

  describe('getProductProfit', () => {
    it('lọc nhóm/mẫu mã/hàng hoá bằng tham số mảng, lợi nhuận = doanh thu − giá vốn', async () => {
      query.mockResolvedValueOnce([{ bucket: '2026-09-01T00:00:00', revenue: 100, cogs: 70 }]);

      const result = await service.getProductProfit(
        {
          ...range,
          unit: MobileRevenueTimeUnit.MONTH,
          categoryIds: [CATEGORY],
          productIds: [PRODUCT],
        },
        actor,
      );

      expect(result.points).toEqual([
        { bucket: '2026-09-01T00:00:00', revenue: 100, cogs: 70, profit: 30 },
      ]);
      expect(sqlAt(0)).toContain('SUM(cost)');
      expect(sqlAt(0)).toContain('category_id::text = ANY($5::text[])');
      expect(sqlAt(0)).toContain('subject_id::text = ANY($6::text[])');
      expect(sqlAt(0)).not.toContain('item_id::text = ANY');
      expect(paramsAt(0).slice(4)).toEqual([[CATEGORY], [PRODUCT]]);
    });

    it('không bộ lọc → không WHERE ngoài', async () => {
      await service.getProductProfit({ ...range, unit: MobileRevenueTimeUnit.DAY }, actor);
      expect(sqlAt(0)).not.toContain('= ANY($5');
      expect(paramsAt(0)).toHaveLength(4);
    });
  });

  describe('getProductShare / getTopProducts', () => {
    it('nhóm hàng gộp theo category_id', async () => {
      await service.getProductShare(
        { ...range, dimension: OverviewShareDimension.PRODUCT_GROUP },
        actor,
      );
      expect(sqlAt(0)).toContain('GROUP BY category_id');
    });

    it('mẫu mã dùng grain subject của mobile, lọc nhóm + mẫu mã qua revenueLinesSql', async () => {
      await service.getProductShare(
        {
          ...range,
          dimension: OverviewShareDimension.VARIANT,
          categoryId: CATEGORY,
          productId: PRODUCT,
        },
        actor,
      );
      expect(sqlAt(0)).toContain('GROUP BY subject_id');
      expect(sqlAt(0)).toContain('it.category_id = $5::uuid');
      expect(sqlAt(0)).toContain('COALESCE(it.product_id, li.item_id) = $6::uuid');
    });

    it('bán chạy theo số lượng, giới hạn dòng', async () => {
      await service.getTopProducts(
        { ...range, sortBy: OverviewTopProductsSortBy.QUANTITY, limit: 10 },
        actor,
      );
      expect(sqlAt(0)).toContain('GROUP BY item_id');
      expect(sqlAt(0)).toContain('ORDER BY quantity DESC');
      expect(sqlAt(0)).toContain('LIMIT 10');
    });
  });
});
