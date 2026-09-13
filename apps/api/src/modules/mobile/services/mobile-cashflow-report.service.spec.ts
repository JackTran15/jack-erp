import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileCashflowKind } from '../dto/mobile-cashflow-report.query.dto';
import { MobileCashflowReportService } from './mobile-cashflow-report.service';

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

const base = { from: '2026-09-01', to: '2026-09-30' };

/**
 * Truy vấn chạy bằng SQL thô, nên phần kiểm được mà KHÔNG cần Postgres là
 * chính câu lệnh (dấu theo loại movement, hai chân của TRANSFER, mốc kỳ, phạm
 * vi chi nhánh, whitelist chiều tiền, tham số bind) và phần ghép trong TS
 * (envelope, làm tròn, gom cửa hàng, dòng chưa xếp hạng mục). Cùng giới hạn
 * đã ghi ở `mobile-debt-report.service.spec.ts`.
 */
describe('MobileCashflowReportService', () => {
  let service: MobileCashflowReportService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileCashflowReportService,
        { provide: getDataSourceToken(), useValue: { query } },
      ],
    }).compile();

    service = module.get(MobileCashflowReportService);
  });

  describe('công thức khớp web "Sổ chi tiết tiền mặt"', () => {
    it('dấu theo loại movement như signedCase(), và TRANSFER có thêm chân ĐÍCH dấu dương', async () => {
      await service.getSummary(base, actor);

      const [sql] = query.mock.calls[0];
      expect(sql).toContain(`WHEN m.type = 'DEPOSIT'    THEN  m.amount`);
      expect(sql).toContain(`WHEN m.type = 'ADJUSTMENT' THEN  m.amount`);
      expect(sql).toContain(`WHEN m.type = 'WITHDRAWAL' THEN -m.amount`);
      expect(sql).toContain(`WHEN m.type = 'TRANSFER'   THEN -m.amount`);
      // chân nguồn và chân đích
      expect(sql).toContain('JOIN cash_accounts ca ON ca.id = m.cash_account_id');
      expect(sql).toContain('JOIN cash_accounts ca ON ca.id = m.to_account_id');
      expect(sql).toContain(`AND m.type = 'TRANSFER'`);
      expect(sql).toContain('UNION ALL');
    });

    it('phạm vi theo cash_accounts.branch_id (text[]), không theo cash_movements.branch_id', async () => {
      await service.getSummary(base, actor);

      const [sql] = query.mock.calls[0];
      expect(sql.match(/ca\.branch_id = ANY\(\$4::text\[\]\)/g)).toHaveLength(2);
      expect(sql).not.toContain('m.branch_id');
      expect(sql).not.toContain('::uuid[]');
    });

    it('mốc cuối trọn ngày ở CTE, mốc đầu `< $2::date` cho đầu kỳ và `>= $2::date` cho thu/chi', async () => {
      await service.getSummary(base, actor);

      const [sql, params] = query.mock.calls[0];
      expect(params).toEqual(['org-1', '2026-09-01', '2026-09-30', [BRANCH_A, BRANCH_B]]);
      expect(sql.match(/m\.created_at < \(\$3::date \+ INTERVAL '1 day'\)/g)).toHaveLength(2);
      expect(sql).not.toContain('<= $3::date');
      expect(sql).toContain('CASE WHEN created_at <  $2::date THEN signed END');
      expect(sql).toContain('CASE WHEN created_at >= $2::date AND signed > 0 THEN  signed END');
      expect(sql).toContain('CASE WHEN created_at >= $2::date AND signed < 0 THEN -signed END');
      // closing là tổng trơn của CTE đã chặn ở hết ngày cuối
      expect(sql).toContain('COALESCE(SUM(signed), 0)::float');
    });

    it('không có vế deleted_at cho cash_movements (bảng không có cột đó)', async () => {
      await service.getSummary(base, actor);

      expect(query.mock.calls[0][0]).not.toContain('deleted_at');
    });
  });

  describe('envelope summary', () => {
    it('làm tròn 2 số, ép Number vì numeric về chuỗi', async () => {
      query.mockResolvedValueOnce([
        { opening: '1000.005', closing: 0.1 + 0.2, income: '500', expense: 200 },
      ]);

      await expect(service.getSummary(base, actor)).resolves.toEqual({
        opening: 1000.01,
        closing: 0.3,
        income: 500,
        expense: 200,
      });
    });

    it('không có dòng nào → bốn số 0', async () => {
      await expect(service.getSummary(base, actor)).resolves.toEqual({
        opening: 0,
        closing: 0,
        income: 0,
        expense: 0,
      });
    });
  });

  describe('phạm vi chi nhánh = tập phân công', () => {
    it('vắng branchIds → bind trọn tập phân công vào $4, ở cả hai endpoint', async () => {
      await service.getSummary(base, actor);
      await service.listStores({ ...base, kind: MobileCashflowKind.INCOME }, actor);

      for (const [, params] of query.mock.calls) {
        expect(params[3]).toEqual([BRANCH_A, BRANCH_B]);
      }
    });

    it('xin đúng một chi nhánh được phân công → chỉ chi nhánh đó', async () => {
      await service.getSummary({ ...base, branchIds: [BRANCH_B] }, actor);

      expect(query.mock.calls[0][1][3]).toEqual([BRANCH_B]);
    });

    it('xin chi nhánh ngoài phân công → 403, KHÔNG chạm DB', async () => {
      await expect(
        service.getSummary({ ...base, branchIds: [BRANCH_C] }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.listStores({ ...base, kind: MobileCashflowKind.EXPENSE, branchIds: [BRANCH_C] }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });

    it('không được phân công chi nhánh nào → 403', async () => {
      await expect(
        service.getSummary(base, { ...actor, branchIds: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('listStores — câu lệnh', () => {
    it.each([
      [MobileCashflowKind.INCOME, 'signed > 0', 'SELECT branch_id, movement_id, signed AS amount'],
      [MobileCashflowKind.EXPENSE, 'signed < 0', 'SELECT branch_id, movement_id, -signed AS amount'],
    ])('%s → whitelist, kind KHÔNG bind vào params', async (kind, where, select) => {
      await service.listStores({ ...base, kind }, actor);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain(`WHERE created_at >= $2::date AND ${where}`);
      expect(sql).toContain(select);
      expect(params).toEqual(['org-1', '2026-09-01', '2026-09-30', [BRANCH_A, BRANCH_B]]);
    });

    it('tìm phiếu bằng LATERAL LIMIT 1, loại phiếu xoá mềm, vế thu chỉ khi không có phiếu chi', async () => {
      await service.listStores({ ...base, kind: MobileCashflowKind.INCOME }, actor);

      const [sql] = query.mock.calls[0];
      expect(sql).toContain('WHERE r.cash_movement_id = p.movement_id AND r.deleted_at IS NULL');
      expect(sql).toContain('WHERE x.cash_movement_id = p.movement_id AND x.deleted_at IS NULL');
      expect(sql.match(/LEFT JOIN LATERAL/g)).toHaveLength(2);
      expect(sql.match(/LIMIT 1/g)).toHaveLength(2);
      expect(sql).toContain('JOIN cash_receipt_lines l ON l.cash_receipt_id = v.receipt_id');
      expect(sql).toContain('WHERE v.payment_id IS NULL');
      expect(sql).toContain('JOIN cash_payment_lines l ON l.cash_payment_id = v.payment_id');
    });

    it('hạng mục chỉ gom dòng có category_id; tên cửa hàng lùi về id; sắp tiền giảm dần, tie-break id', async () => {
      await service.listStores({ ...base, kind: MobileCashflowKind.INCOME }, actor);

      const [sql] = query.mock.calls[0];
      expect(sql).toContain('WHERE category_id IS NOT NULL');
      expect(sql).toContain('LEFT JOIN branches b ON b.id::text = s.branch_id');
      expect(sql).toContain('COALESCE(b.name, s.branch_id)  AS name');
      expect(sql).toContain(
        'ORDER BY s.amount DESC, s.branch_id ASC, c.amount DESC NULLS LAST, cat.name ASC',
      );
    });
  });

  describe('listStores — gom cửa hàng', () => {
    it('nhiều dòng cùng cửa hàng → một cửa hàng nhiều hạng mục, giữ thứ tự SQL, thêm dòng dư id null cuối', async () => {
      query.mockResolvedValueOnce([
        { id: BRANCH_A, name: 'Đà Nẵng', amount: '1000', categoryId: 'c1', categoryName: 'Thu bán hàng', categoryAmount: '700' },
        { id: BRANCH_A, name: 'Đà Nẵng', amount: '1000', categoryId: 'c2', categoryName: 'Thu khác', categoryAmount: '100' },
        { id: BRANCH_B, name: 'Vĩnh Long', amount: 400, categoryId: 'c1', categoryName: 'Thu bán hàng', categoryAmount: 400 },
      ]);

      const result = await service.listStores({ ...base, kind: MobileCashflowKind.INCOME }, actor);

      expect(result).toEqual({
        data: [
          {
            id: BRANCH_A,
            name: 'Đà Nẵng',
            amount: 1000,
            categories: [
              { id: 'c1', name: 'Thu bán hàng', amount: 700 },
              { id: 'c2', name: 'Thu khác', amount: 100 },
              { id: null, name: null, amount: 200 },
            ],
          },
          {
            id: BRANCH_B,
            name: 'Vĩnh Long',
            amount: 400,
            categories: [{ id: 'c1', name: 'Thu bán hàng', amount: 400 }],
          },
        ],
      });
    });

    it('cửa hàng không có phiếu nào → đúng một dòng id null bằng trọn tiền', async () => {
      query.mockResolvedValueOnce([
        { id: BRANCH_A, name: 'Đà Nẵng', amount: 250.5, categoryId: null, categoryName: null, categoryAmount: null },
      ]);

      const result = await service.listStores({ ...base, kind: MobileCashflowKind.EXPENSE }, actor);

      expect(result.data[0].categories).toEqual([{ id: null, name: null, amount: 250.5 }]);
    });

    it('Σ hạng mục vượt tiền cửa hàng (ca biên) → không có dòng null, không kẹp hạng mục', async () => {
      query.mockResolvedValueOnce([
        { id: BRANCH_A, name: 'Đà Nẵng', amount: 100, categoryId: 'c1', categoryName: 'Chi lương', categoryAmount: 150 },
      ]);

      const result = await service.listStores({ ...base, kind: MobileCashflowKind.EXPENSE }, actor);

      expect(result.data[0].categories).toEqual([{ id: 'c1', name: 'Chi lương', amount: 150 }]);
    });

    it('hạng mục đã bị xoá (tên null) vẫn giữ id, tên null; không có dòng → data rỗng', async () => {
      query.mockResolvedValueOnce([
        { id: BRANCH_A, name: 'Đà Nẵng', amount: 100, categoryId: 'c9', categoryName: null, categoryAmount: 100 },
      ]);

      const result = await service.listStores({ ...base, kind: MobileCashflowKind.INCOME }, actor);
      expect(result.data[0].categories).toEqual([{ id: 'c9', name: null, amount: 100 }]);

      await expect(
        service.listStores({ ...base, kind: MobileCashflowKind.INCOME }, actor),
      ).resolves.toEqual({ data: [] });
    });
  });
});
