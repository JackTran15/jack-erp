import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileInvoiceDateBasis } from '../dto/mobile-invoice-list.query.dto';
import {
  MobileRevenueEstimateGroupBy,
  MobileRevenueEstimateStaffRole,
} from '../dto/mobile-revenue-estimate.query.dto';
import {
  MobileRevenueEstimateService,
  RevenueEstimateQuery,
} from './mobile-revenue-estimate.service';

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

const base: RevenueEstimateQuery = {
  from: '2026-09-01',
  to: '2026-09-30',
  dateBasis: MobileInvoiceDateBasis.ISSUED,
  groupBy: MobileRevenueEstimateGroupBy.TIME,
};

/**
 * SQL thô nên phần kiểm được không cần Postgres là chính câu lệnh (cột ngày
 * theo `dateBasis`, loại nháp, GROUP BY theo trục, join nhân viên đúng KIỂU
 * cột, bốn nguồn của câu thanh toán) và phần ghép trong TS (lọc dòng 0, sắp,
 * tổng, 400 liên trường). Cùng giới hạn `mobile-overview-report.service.spec.ts`.
 */
describe('MobileRevenueEstimateService', () => {
  let service: MobileRevenueEstimateService;
  let query: jest.Mock;

  const sqlOf = (): string => query.mock.calls[0][0] as string;
  const paramsOf = (): unknown[] => query.mock.calls[0][1] as unknown[];

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileRevenueEstimateService,
        { provide: getDataSourceToken(), useValue: { query } },
      ],
    }).compile();

    service = module.get(MobileRevenueEstimateService);
  });

  describe('cột ngày theo dateBasis', () => {
    it('issued → lọc issued_at qua CTE của revenue-report, vẫn loại huỷ và loại nháp', async () => {
      await service.getReport(base, actor);

      const sql = sqlOf();
      expect(sql).toContain('WITH lines AS');
      expect(sql).toContain(`i.status <> 'cancelled'`);
      expect(sql).toContain('i.is_draft = false');
      expect(sql).toContain('i.issued_at >= $2::date');
      expect(sql).toContain(`i.issued_at < ($3::date + INTERVAL '1 day')`);
      expect(sql).not.toContain('i.created_at >=');
      expect(sql).toContain('(li.line_total - li.promotion_discount)');
      expect(paramsOf()).toEqual(['org-1', '2026-09-01', '2026-09-30', [BRANCH_A, BRANCH_B]]);
    });

    it('created → lọc created_at và gộp ngày theo created_at', async () => {
      await service.getReport({ ...base, dateBasis: MobileInvoiceDateBasis.CREATED }, actor);

      const sql = sqlOf();
      expect(sql).toContain('i.created_at >= $2::date');
      expect(sql).toContain(`i.created_at < ($3::date + INTERVAL '1 day')`);
      expect(sql).toContain(`to_char(l.created_at, 'YYYY-MM-DD') AS key`);
      expect(sql).not.toContain('i.issued_at >=');
    });
  });

  describe('câu gộp theo trục', () => {
    it('time: khoá yyyy-MM-dd của issued_at, đếm DISTINCT invoice_id, tăng dần theo ngày', async () => {
      await service.getReport(base, actor);

      const sql = sqlOf();
      expect(sql).toContain(`to_char(l.issued_at, 'YYYY-MM-DD') AS key`);
      expect(sql).toContain('COUNT(DISTINCT l.invoice_id)::int');
      expect(sql).toContain('ORDER BY key ASC');
    });

    it('status: gộp theo invoice_status, key là text', async () => {
      await service.getReport({ ...base, groupBy: MobileRevenueEstimateGroupBy.STATUS }, actor);

      const sql = sqlOf();
      expect(sql).toContain('l.invoice_status::text AS key');
      expect(sql).toContain('GROUP BY l.invoice_status');
      expect(sql).toContain('ORDER BY revenue DESC, key ASC');
    });

    it('channel: một bucket in_store, rỗng khi không có dòng', async () => {
      await service.getReport({ ...base, groupBy: MobileRevenueEstimateGroupBy.CHANNEL }, actor);

      const sql = sqlOf();
      expect(sql).toContain(`'in_store' AS key`);
      expect(sql).toContain('HAVING COUNT(*) > 0');
    });

    it('staff/creator: created_by là VARCHAR → so với users.id::text', async () => {
      await service.getReport(
        {
          ...base,
          groupBy: MobileRevenueEstimateGroupBy.STAFF,
          staffRole: MobileRevenueEstimateStaffRole.CREATOR,
        },
        actor,
      );

      const sql = sqlOf();
      expect(sql).toContain('LEFT JOIN users u ON u.id::text = l.created_by');
      expect(sql).toContain(`COALESCE(l.created_by, 'unassigned') AS key`);
      expect(sql).toContain("CONCAT_WS(' ', u.first_name, u.last_name)");
      expect(sql).toContain('ORDER BY revenue DESC, label ASC NULLS LAST, key ASC');
    });

    it('staff/cashier: staff_id là uuid → join thẳng users', async () => {
      await service.getReport(
        {
          ...base,
          groupBy: MobileRevenueEstimateGroupBy.STAFF,
          staffRole: MobileRevenueEstimateStaffRole.CASHIER,
        },
        actor,
      );

      expect(sqlOf()).toContain('LEFT JOIN users u ON u.id = l.staff_id');
    });

    it('staff/salesperson: qua employee_profiles rồi mới tới users; key là id PROFILE', async () => {
      await service.getReport(
        {
          ...base,
          groupBy: MobileRevenueEstimateGroupBy.STAFF,
          staffRole: MobileRevenueEstimateStaffRole.SALESPERSON,
        },
        actor,
      );

      const sql = sqlOf();
      expect(sql).toContain('LEFT JOIN employee_profiles ep ON ep.id = l.salesperson_id');
      expect(sql).toContain('LEFT JOIN users u ON u.id = ep.user_id');
      expect(sql).toContain(`COALESCE(l.salesperson_id::text, 'unassigned') AS key`);
    });

    it('payment: KHÔNG qua dòng hàng — bốn nguồn UNION ALL trên cùng phạm vi hoá đơn', async () => {
      await service.getReport(
        { ...base, groupBy: MobileRevenueEstimateGroupBy.PAYMENT, dateBasis: MobileInvoiceDateBasis.CREATED },
        actor,
      );

      const sql = sqlOf();
      expect(sql).not.toContain('WITH lines');
      expect(sql).toContain('WITH inv AS');
      // Cùng mảnh phạm vi với CTE dòng hàng — loại huỷ, loại nháp, đúng cột ngày.
      expect(sql).toContain(`i.status <> 'cancelled'`);
      expect(sql).toContain('i.is_draft = false');
      expect(sql).toContain('i.created_at >= $2::date');
      expect(sql).toContain('i.branch_id = ANY($4::text[])');
      // Bốn nguồn.
      expect(sql).toContain('GREATEST(amount_due - total_paid, 0)');
      expect(sql).toContain(`status IN ('debt', 'partial_debt')`);
      expect(sql).toContain(`CASE WHEN inv.type = 'RETURN' THEN -1 ELSE 1 END`);
      expect(sql).toContain('p.payment_method::text AS key');
      expect(sql).toContain(`ip.promotion_type = 'voucher'`);
      expect(sql).toContain('points_discount_amount > 0');
    });
  });

  describe('staffRole đi đôi với groupBy=staff', () => {
    it('staff mà thiếu staffRole → 400, chưa chạm database', async () => {
      await expect(
        service.getReport({ ...base, groupBy: MobileRevenueEstimateGroupBy.STAFF }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('có staffRole mà groupBy khác staff → 400', async () => {
      await expect(
        service.getReport(
          { ...base, staffRole: MobileRevenueEstimateStaffRole.CASHIER },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('phạm vi chi nhánh', () => {
    it('không phân công → 403 — mobile không có vế hợp nhất', async () => {
      await expect(
        service.getReport(base, { ...actor, branchIds: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });

    it('xin chi nhánh ngoài phân công → 403', async () => {
      await expect(
        service.getReport({ ...base, branchIds: [BRANCH_C] }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('xin đúng một chi nhánh được phân công → bind đúng chi nhánh đó', async () => {
      await service.getReport({ ...base, branchIds: [BRANCH_B] }, actor);
      expect(paramsOf()[3]).toEqual([BRANCH_B]);
    });
  });

  describe('ghép trong TS', () => {
    it('totals = Σ items; số dạng chuỗi được ép; label vắng thành null; giữ thứ tự SQL ở time', async () => {
      query.mockResolvedValue([
        { key: '2026-09-01', label: null, orderCount: '2', revenue: '100.5' },
        { key: '2026-09-03', label: null, orderCount: 1, revenue: 20 },
      ]);

      const result = await service.getReport(base, actor);

      expect(result.items).toEqual([
        { key: '2026-09-01', label: null, orderCount: 2, revenue: 100.5 },
        { key: '2026-09-03', label: null, orderCount: 1, revenue: 20 },
      ]);
      expect(result.totals).toEqual({ orderCount: 3, revenue: 120.5 });
    });

    it('payment: bỏ nguồn 0 đơn, sắp doanh thu giảm dần rồi key', async () => {
      query.mockResolvedValue([
        { key: 'unpaid', label: null, orderCount: 0, revenue: 0 },
        { key: 'cash', label: null, orderCount: 3, revenue: 500 },
        { key: 'card', label: null, orderCount: 1, revenue: 700 },
        { key: 'voucher', label: null, orderCount: 0, revenue: 0 },
        { key: 'points', label: null, orderCount: 2, revenue: 500 },
      ]);

      const result = await service.getReport(
        { ...base, groupBy: MobileRevenueEstimateGroupBy.PAYMENT },
        actor,
      );

      expect(result.items.map((i) => i.key)).toEqual(['card', 'cash', 'points']);
      expect(result.totals).toEqual({ orderCount: 6, revenue: 1700 });
    });

    it('staff: label giữ nguyên chuỗi server trả', async () => {
      query.mockResolvedValue([
        { key: 'u-1', label: 'Nguyễn Văn A', orderCount: 1, revenue: 10 },
        { key: 'unassigned', label: null, orderCount: 1, revenue: 5 },
      ]);

      const result = await service.getReport(
        {
          ...base,
          groupBy: MobileRevenueEstimateGroupBy.STAFF,
          staffRole: MobileRevenueEstimateStaffRole.CREATOR,
        },
        actor,
      );

      expect(result.items[0].label).toBe('Nguyễn Văn A');
      expect(result.items[1].label).toBeNull();
    });
  });
});
