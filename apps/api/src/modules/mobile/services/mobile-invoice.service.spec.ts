import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceService } from '../../pos/services/invoice.service';
import {
  MobileInvoiceDateBasis,
  MobileInvoiceOrder,
  MobileInvoiceStatus,
} from '../dto/mobile-invoice-list.query.dto';
import { MobileInvoiceService } from './mobile-invoice.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1', 'branch-2'],
  roles: [],
};

const createdAt = new Date('2026-07-31T14:36:56.719Z');
const issuedAt = new Date('2026-07-31T14:36:56.908Z');

/** Dòng thô như Postgres trả: `type`/`status` còn là giá trị cột. */
const rawRow = {
  id: 'inv-1',
  code: 'INV-202607-00062',
  type: 'SALE',
  status: 'partial_debt',
  createdAt,
  issuedAt,
  amount: 799000,
  customerName: 'Trần Thị Bình',
  customerPhone: '0901000003',
};

/** Bản ghi như `InvoiceService.findOneWithItems` trả về (số là CHUỖI). */
function detailOf(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    code: 'INV-202607-00062',
    type: 'SALE',
    status: 'paid',
    isDraft: false,
    createdAt,
    issuedAt,
    amountDue: '799000.00',
    netAmount: '0.00',
    subtotal: '899000.00',
    discountAmount: '50000.00',
    pointsDiscountAmount: '50000.00',
    pointsBalanceAfter: 1948,
    pointsEarned: 79,
    pointsRedeemed: 0,
    salespersonId: null,
    staffName: 'Inventory Admin',
    customer: { name: 'Trần Thị Bình', phone: '0901000003' },
    items: [
      {
        direction: 'OUT',
        itemName: 'Giày A',
        itemCode: 'A-41',
        unit: 'Đôi',
        quantity: '1.00',
        unitPrice: '799000.00',
        lineTotal: '799000.00',
      },
      {
        direction: 'IN',
        itemName: 'Giày trả',
        itemCode: 'B-40',
        unit: 'Đôi',
        quantity: '1.00',
        unitPrice: '500000.00',
        lineTotal: '500000.00',
      },
    ],
    payments: [{ amount: '500000.00' }, { amount: '400000.00' }],
    appliedPromotions: [{ type: 'BUY_X_GET_Y', discountAmount: 0 }],
    ...overrides,
  };
}

/**
 * Danh sách chạy bằng SQL thô nên phần kiểm được mà KHÔNG cần Postgres là
 * chính câu lệnh; chi tiết uỷ quyền `InvoiceService` nên phần kiểm là phép
 * NẮN sang hình dạng app. E2E lo phần còn lại.
 */
describe('MobileInvoiceService', () => {
  let service: MobileInvoiceService;
  let query: jest.Mock;
  let invoices: { findOneWithItems: jest.Mock };

  const stubCount = [{ total: 7, totalAmount: 3_500_000 }];

  beforeEach(async () => {
    query = jest
      .fn()
      .mockResolvedValueOnce([rawRow])
      .mockResolvedValueOnce(stubCount);
    invoices = { findOneWithItems: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileInvoiceService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: InvoiceService, useValue: invoices },
      ],
    }).compile();

    service = module.get(MobileInvoiceService);
  });

  const run = (
    overrides: Partial<Parameters<MobileInvoiceService['list']>[0]> = {},
  ) =>
    service.list(
      {
        page: 1,
        limit: 20,
        order: MobileInvoiceOrder.DESC,
        dateBasis: MobileInvoiceDateBasis.CREATED,
        ...overrides,
      },
      actor,
    );

  const dataSql = (): string => query.mock.calls[0][0] as string;
  const dataParams = (): unknown[] => query.mock.calls[0][1] as unknown[];
  const countSql = (): string => query.mock.calls[1][0] as string;
  const countParams = (): unknown[] => query.mock.calls[1][1] as unknown[];

  describe('list', () => {
    it('phạm vi TỔ CHỨC qua $1 + PHÂN CÔNG qua $3, loại nháp, và chỉ các trạng thái app nhìn thấy', async () => {
      await run();

      expect(dataParams()[0]).toBe('org-1');
      expect(dataSql()).toContain('i.organization_id = $1');
      expect(dataSql()).toContain('i.is_draft = false');
      // Vắng `status` = mọi trạng thái ĐÃ GHI SỔ — không có draft/pending.
      expect(dataSql()).toContain('i.status::text = ANY($2::text[])');
      expect(dataParams()[1]).toEqual(['paid', 'debt', 'partial_debt', 'cancelled']);
      // Vắng `branchIds` = đúng tập phân công — LUÔN có mệnh đề, mobile
      // không có vế hợp nhất.
      expect(dataSql()).toContain('i.branch_id = ANY($3::text[])');
      expect(dataParams()[2]).toEqual(['branch-1', 'branch-2']);
    });

    it('trạng thái app -> các giá trị cột (unpaid gom debt + partial_debt)', async () => {
      await run({
        status: [MobileInvoiceStatus.UNPAID, MobileInvoiceStatus.CANCELLED],
      });

      expect(dataParams()[1]).toEqual(['debt', 'partial_debt', 'cancelled']);
    });

    it('khoá theo khách khi có customerId, theo cửa hàng khi có branchIds (mảng text)', async () => {
      await run({ customerId: 'cus-1', branchIds: ['branch-1', 'branch-2'] });

      expect(dataSql()).toContain('i.customer_id = $3');
      // `branch_id` là VARCHAR — ép uuid là so hai kiểu khác nhau.
      expect(dataSql()).toContain('i.branch_id = ANY($4::text[])');
      expect(dataParams()).toEqual([
        'org-1',
        ['paid', 'debt', 'partial_debt', 'cancelled'],
        'cus-1',
        ['branch-1', 'branch-2'],
        20,
        0,
      ]);
    });

    describe('phạm vi chi nhánh — đúng tập phân công, không có vế hợp nhất', () => {
      it('xin chi nhánh ngoài phân công → 403, chưa chạm database', async () => {
        await expect(run({ branchIds: ['branch-9'] })).rejects.toBeInstanceOf(ForbiddenException);
        expect(query).not.toHaveBeenCalled();
      });

      it('không phân công → 403', async () => {
        await expect(
          service.list(
            { page: 1, limit: 20, order: MobileInvoiceOrder.DESC, dateBasis: MobileInvoiceDateBasis.CREATED },
            { ...actor, branchIds: [] },
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    it('dateBasis chọn cột cho CẢ khoảng lọc lẫn ORDER BY; `to` bao trọn ngày cuối', async () => {
      await run({
        dateBasis: MobileInvoiceDateBasis.ISSUED,
        from: '2026-08-01',
        to: '2026-08-31',
        order: MobileInvoiceOrder.ASC,
      });

      expect(dataSql()).toContain('i.issued_at >= $4::date');
      expect(dataSql()).toContain("i.issued_at < ($5::date + INTERVAL '1 day')");
      expect(dataSql()).toContain(
        'ORDER BY i.issued_at ASC NULLS LAST, i.created_at ASC, i.id ASC',
      );
      expect(dataSql()).not.toContain('created_at >=');
    });

    it('mặc định sắp theo ngày tạo GIẢM dần, tie-break `i.id`', async () => {
      await run();

      expect(dataSql()).toContain(
        'ORDER BY i.created_at DESC NULLS LAST, i.created_at DESC, i.id ASC',
      );
    });

    it('tìm kiếm tra số hoá đơn, đã escape ký tự đại diện', async () => {
      await run({ search: '50%_x' });

      expect(dataSql()).toContain('i.code ILIKE $4');
      expect(dataParams()[3]).toBe('%50\\%\\_x%');
    });

    it('câu ĐẾM cùng WHERE, không LIMIT, và totalAmount LOẠI hoá đơn huỷ', async () => {
      await run({ customerId: 'cus-1', search: 'INV' });

      expect(countSql()).toContain('i.customer_id = $3');
      expect(countSql()).toContain('i.code ILIKE $5');
      expect(countSql()).not.toContain('LIMIT');
      expect(countSql()).toContain("FILTER (WHERE i.status::text <> 'cancelled')");
      expect(countParams()).toEqual([
        'org-1',
        ['paid', 'debt', 'partial_debt', 'cancelled'],
        'cus-1',
        ['branch-1', 'branch-2'],
        '%INV%',
      ]);
    });

    it('số tiền là tổng CÓ DẤU: net_amount cho trả/đổi, amount_due cho bán', async () => {
      await run();

      expect(dataSql()).toContain(
        "CASE WHEN i.type IN ('RETURN', 'EXCHANGE') THEN i.net_amount ELSE i.amount_due END",
      );
    });

    it('nắn dòng thô: type/status về chữ thường của app, ngày về ISO', async () => {
      const result = await run({ page: 2, limit: 5 });

      expect(result).toEqual({
        data: [
          {
            id: 'inv-1',
            code: 'INV-202607-00062',
            type: 'sale',
            status: 'unpaid',
            createdAt: '2026-07-31T14:36:56.719Z',
            issuedAt: '2026-07-31T14:36:56.908Z',
            amount: 799000,
            customerName: 'Trần Thị Bình',
            customerPhone: '0901000003',
          },
        ],
        total: 7,
        page: 2,
        limit: 5,
        totalAmount: 3_500_000,
      });
    });
  });

  describe('findById', () => {
    beforeEach(() => query.mockReset());

    it('nắn bản ghi của InvoiceService sang hình dạng app', async () => {
      invoices.findOneWithItems.mockResolvedValue(detailOf());

      const result = await service.findById('inv-1', actor);

      expect(invoices.findOneWithItems).toHaveBeenCalledWith('inv-1', actor);
      expect(result).toEqual({
        id: 'inv-1',
        code: 'INV-202607-00062',
        type: 'sale',
        status: 'paid',
        createdAt: '2026-07-31T14:36:56.719Z',
        issuedAt: '2026-07-31T14:36:56.908Z',
        amount: 799000,
        customerName: 'Trần Thị Bình',
        customerPhone: '0901000003',
        salesperson: null,
        cashier: 'Inventory Admin',
        subtotal: 899000,
        // Chiết khấu hoá đơn + chiết khấu điểm — app có đúng một dòng.
        discount: 100000,
        // Tổng tiền khách ĐƯA qua mọi phương thức, rồi thừa = đưa − phải trả.
        cashReceived: 900000,
        changeAmount: 101000,
        promotions: ['BUY_X_GET_Y'],
        // Số dư TRƯỚC hoá đơn suy ngược từ số dư sau.
        loyalty: { opening: 1869, earned: 79, used: 0 },
        // Hoá đơn BÁN chỉ lấy dòng đi RA; dòng `IN` (đổi hàng) bị bỏ.
        lines: [
          {
            name: 'Giày A',
            sku: 'A-41',
            unit: 'Đôi',
            quantity: 1,
            unitPrice: 799000,
            total: 799000,
          },
        ],
      });
      // Không có nhân viên bán thì không tra tên — không câu SQL nào.
      expect(query).not.toHaveBeenCalled();
    });

    it('trả hàng: số tiền ÂM từ net_amount, dòng đi VÀO, không có tiền thừa', async () => {
      invoices.findOneWithItems.mockResolvedValue(
        detailOf({
          type: 'RETURN',
          amountDue: '0.00',
          netAmount: '-500000.00',
          payments: [],
          pointsBalanceAfter: null,
        }),
      );

      const result = await service.findById('inv-1', actor);

      expect(result.type).toBe('return');
      expect(result.amount).toBe(-500000);
      expect(result.lines.map((line) => line.sku)).toEqual(['B-40']);
      expect(result.cashReceived).toBe(0);
      // Tiền hoàn KHÔNG phải tiền thừa: `max(0, 0 − max(−500000, 0))`.
      expect(result.changeAmount).toBe(0);
      expect(result.loyalty).toBeNull();
    });

    it('có nhân viên bán -> tra tên qua employee_profiles JOIN users, lọc tổ chức', async () => {
      invoices.findOneWithItems.mockResolvedValue(detailOf({ salespersonId: 'ep-1' }));
      query.mockResolvedValueOnce([{ name: 'Nguyễn Văn Bán' }]);

      const result = await service.findById('inv-1', actor);

      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('FROM employee_profiles ep');
      expect(sql).toContain('JOIN users u ON u.id = ep.user_id');
      expect(sql).toContain('ep.organization_id = $1');
      expect(params).toEqual(['org-1', 'ep-1']);
      expect(result.salesperson).toBe('Nguyễn Văn Bán');
    });

    it('404 tiếng Việt: không có, hoặc là NHÁP / pending', async () => {
      invoices.findOneWithItems.mockRejectedValueOnce(
        new NotFoundException('Invoice inv-1 not found'),
      );
      await expect(service.findById('inv-1', actor)).rejects.toThrow(
        new NotFoundException('Không tìm thấy hoá đơn.'),
      );

      invoices.findOneWithItems.mockResolvedValueOnce(detailOf({ isDraft: true }));
      await expect(service.findById('inv-1', actor)).rejects.toThrow(
        new NotFoundException('Không tìm thấy hoá đơn.'),
      );

      invoices.findOneWithItems.mockResolvedValueOnce(detailOf({ status: 'pending' }));
      await expect(service.findById('inv-1', actor)).rejects.toThrow(
        new NotFoundException('Không tìm thấy hoá đơn.'),
      );
    });

    it('lỗi KHÁC 404 của InvoiceService đi qua nguyên vẹn', async () => {
      const boom = new Error('db down');
      invoices.findOneWithItems.mockRejectedValueOnce(boom);

      await expect(service.findById('inv-1', actor)).rejects.toBe(boom);
    });
  });
});
