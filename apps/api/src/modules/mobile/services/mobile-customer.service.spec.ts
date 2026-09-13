import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CustomerService } from '../../customer/customer.service';
import {
  MobileCustomerOrder,
  MobileCustomerSort,
  MobileCustomerStatus,
} from '../dto/mobile-customer-list.query.dto';
import { MobileCustomerService } from './mobile-customer.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

/**
 * Truy vấn chạy bằng SQL thô, nên phần kiểm được mà KHÔNG cần Postgres là
 * chính câu lệnh: phạm vi tổ chức, loại `MERGED`, thứ tự sắp xếp, và những cột
 * KHÔNG được chọn. E2E (`test/e2e/mobile.e2e-spec.ts`) lo phần còn lại, nhưng
 * nó cần database — nên bộ này là lưới duy nhất chạy được ở mọi máy.
 */
describe('MobileCustomerService', () => {
  let service: MobileCustomerService;
  let query: jest.Mock;
  let customers: { create: jest.Mock; update: jest.Mock };

  const stubRows = [
    {
      id: 'c-1',
      code: 'KH000002',
      name: 'Nguyễn Văn An',
      phone: '0901000002',
      revenue: 850000,
      invoiceCount: 1,
    },
  ];
  const stubCount = [{ total: 7, totalRevenue: 3_500_000 }];

  beforeEach(async () => {
    // `list` gọi query() hai lần qua Promise.all: dataSql rồi countSql.
    query = jest
      .fn()
      .mockResolvedValueOnce(stubRows)
      .mockResolvedValueOnce(stubCount);

    customers = { create: jest.fn(), update: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileCustomerService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: CustomerService, useValue: customers },
      ],
    }).compile();

    service = module.get(MobileCustomerService);
  });

  const run = (
    overrides: {
      page?: number;
      limit?: number;
      sort?: MobileCustomerSort;
      order?: MobileCustomerOrder;
      status?: MobileCustomerStatus;
      search?: string;
    } = {},
  ) =>
    service.list(
      {
        page: 1,
        limit: 20,
        sort: MobileCustomerSort.NAME,
        order: MobileCustomerOrder.ASC,
        ...overrides,
      },
      actor,
    );

  /** Câu lệnh lấy dữ liệu là lần gọi ĐẦU; lần thứ hai là đếm. */
  const dataSql = (): string => query.mock.calls[0][0] as string;
  const dataParams = (): unknown[] => query.mock.calls[0][1] as unknown[];
  const countSql = (): string => query.mock.calls[1][0] as string;
  const countParams = (): unknown[] => query.mock.calls[1][1] as unknown[];

  it('phạm vi TỔ CHỨC đi qua tham số $1 ở CẢ CTE lẫn bảng khách', async () => {
    await run();

    expect(dataParams()[0]).toBe('org-1');
    // Hai chỗ, cố ý: CTE lọc hoá đơn theo tổ chức, câu ngoài lọc khách. Bỏ
    // một trong hai vẫn "chạy đúng" ở đường bình thường — chỉ test giữ được.
    expect(dataSql()).toContain('WHERE organization_id = $1');
    expect(dataSql()).toContain('c.organization_id = $1');
    expect(dataSql()).not.toContain('org-1');
  });

  it('LUÔN loại khách đã gộp, kể cả khi không lọc trạng thái', async () => {
    await run();

    expect(dataSql()).toContain(`c.status::text <> 'MERGED'`);
    expect(countSql()).toContain(`c.status::text <> 'MERGED'`);
  });

  it('phân trang thành LIMIT/OFFSET đúng thứ tự $2/$3', async () => {
    await run({ page: 3, limit: 5 });

    expect(dataParams()).toEqual(['org-1', 5, 10]);
    expect(dataSql()).toContain('LIMIT $2 OFFSET $3');
  });

  it('trả envelope {data,total,page,limit,totalRevenue} — hai số tổng lấy từ câu ĐẾM', async () => {
    const result = await run({ page: 2, limit: 5 });

    // `totalRevenue` là của TOÀN tập khớp (3.5tr), không phải cộng `revenue`
    // của trang (850k). Lấy từ câu đếm là cách duy nhất đúng khi phân trang.
    expect(result).toEqual({
      data: stubRows,
      total: 7,
      page: 2,
      limit: 5,
      totalRevenue: 3_500_000,
    });
  });

  it('mỗi cặp (tiêu chí, chiều) có ORDER BY riêng, và MỌI nhánh kết bằng `c.id`', async () => {
    const expected: [MobileCustomerSort, MobileCustomerOrder, string][] = [
      [
        MobileCustomerSort.NAME,
        MobileCustomerOrder.ASC,
        'ORDER BY lower(c.name) ASC, c.id ASC',
      ],
      [
        MobileCustomerSort.NAME,
        MobileCustomerOrder.DESC,
        'ORDER BY lower(c.name) DESC, c.id ASC',
      ],
      [
        MobileCustomerSort.REVENUE,
        MobileCustomerOrder.ASC,
        'ORDER BY revenue ASC, lower(c.name) ASC, c.id ASC',
      ],
      [
        MobileCustomerSort.REVENUE,
        MobileCustomerOrder.DESC,
        'ORDER BY revenue DESC, lower(c.name) ASC, c.id ASC',
      ],
    ];

    for (const [sort, order, clause] of expected) {
      query.mockClear();
      query
        .mockResolvedValueOnce(stubRows)
        .mockResolvedValueOnce(stubCount);

      await run({ sort, order });

      expect(dataSql()).toContain(clause);
      expect(dataSql()).toMatch(/ORDER BY[^\n]*c\.id ASC/);
    }
  });

  it('giá trị `sort`/`order` lạ KHÔNG lọt vào câu lệnh', async () => {
    // Không đi qua ValidationPipe được ở tầng này, nên đây là bằng chứng rằng
    // ORDER BY dựng từ bảng tra trên enum chứ không từ chuỗi của client.
    await expect(
      run({ sort: "name'; DROP TABLE customers; --" as MobileCustomerSort }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('KHÔNG chọn CCCD, mã số thuế hay tên công ty', async () => {
    await run();

    // Ca quan trọng nhất của cả bộ: mọi quyết định khác hỏng thì hiện ra trên
    // màn hình, riêng rò CCCD thì hỏng trong im lặng.
    expect(dataSql()).not.toContain('national_id');
    expect(dataSql()).not.toContain('tax_code');
    expect(dataSql()).not.toContain('company_name');
    expect(dataSql()).not.toContain('c.*');
  });

  it('doanh thu chỉ đếm hoá đơn BÁN đã chốt — cùng định nghĩa với CustomerSummaryService', async () => {
    await run();

    expect(dataSql()).toContain(`type = 'SALE'`);
    expect(dataSql()).toContain(`status IN ('paid', 'debt', 'partial_debt')`);
    // Khách chưa mua gì vẫn phải ra một dòng với doanh thu 0, nên là LEFT JOIN.
    expect(dataSql()).toContain('LEFT JOIN sales s');
  });

  it('hạng thẻ lấy TÊN của tổ chức, loại bản đã xoá mềm', async () => {
    await run();

    expect(dataSql()).toContain('t.tier = m.tier');
    expect(dataSql()).toContain('t.deleted_at IS NULL');
    expect(dataSql()).toContain('COALESCE(t.name, m.tier::text)');
  });

  describe('lọc trạng thái', () => {
    it('`active` -> so với cột viết HOA qua tham số', async () => {
      await run({ status: MobileCustomerStatus.ACTIVE });

      expect(dataSql()).toContain('c.status::text = $2');
      expect(dataParams()).toEqual(['org-1', 'ACTIVE', 20, 0]);
    });

    it('`inactive` -> INACTIVE, và MERGED vẫn bị loại riêng', async () => {
      await run({ status: MobileCustomerStatus.INACTIVE });

      expect(dataParams()[1]).toBe('INACTIVE');
      expect(dataSql()).toContain(`c.status::text <> 'MERGED'`);
    });

    it('vắng status thì không có tham số trạng thái nào', async () => {
      await run();

      expect(dataSql()).not.toContain('c.status::text = $');
      expect(dataParams()).toEqual(['org-1', 20, 0]);
    });
  });

  describe('tìm kiếm', () => {
    it('lọc theo mã HOẶC tên HOẶC số điện thoại, trong một cặp ngoặc', async () => {
      await run({ search: '0901' });

      // OR chứ không AND, và cả ba cùng một tham số: một ô gõ duy nhất, khớp
      // cột nào cũng tính.
      expect(dataSql()).toContain(
        `(c.code ILIKE $2 OR c.name ILIKE $2 OR COALESCE(c.phone, '') ILIKE $2)`,
      );
      expect(dataParams()).toEqual(['org-1', '%0901%', 20, 0]);
    });

    it('ĐẨY số của LIMIT/OFFSET đi khi có cả status lẫn search', async () => {
      await run({
        page: 3,
        limit: 5,
        status: MobileCustomerStatus.ACTIVE,
        search: 'an',
      });

      expect(dataSql()).toContain('c.status::text = $2');
      expect(dataSql()).toContain('ILIKE $3');
      expect(dataSql()).toContain('LIMIT $4 OFFSET $5');
      expect(dataParams()).toEqual(['org-1', 'ACTIVE', '%an%', 5, 10]);
    });

    it('câu ĐẾM dùng CÙNG mệnh đề WHERE nhưng KHÔNG có LIMIT/OFFSET', async () => {
      await run({ status: MobileCustomerStatus.ACTIVE, search: 'an' });

      expect(countSql()).toContain('c.status::text = $2');
      expect(countSql()).toContain('ILIKE $3');
      expect(countSql()).not.toContain('LIMIT');
      expect(countSql()).not.toContain('ORDER BY');
      expect(countParams()).toEqual(['org-1', 'ACTIVE', '%an%']);
    });

    it('escape `%` và `_` — người dùng gõ chúng là ký tự, không phải ký tự đại diện', async () => {
      await run({ search: '50%_off' });

      expect(dataParams()[1]).toBe('%50\\%\\_off%');
    });

    it('rỗng hoặc toàn khoảng trắng thì KHÔNG có mệnh đề tìm kiếm', async () => {
      await run({ search: '   ' });

      expect(dataSql()).not.toContain('ILIKE');
      expect(dataParams()).toEqual(['org-1', 20, 0]);
    });
  });

  describe('findById', () => {
    const customerId = 'd0000000-0000-4000-8000-000000000005';

    beforeEach(() => query.mockReset());

    it('tra theo id NHƯNG vẫn lọc tổ chức và loại MERGED', async () => {
      query.mockResolvedValueOnce(stubRows);

      const result = await service.findById(customerId, actor);

      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('c.organization_id = $1');
      expect(sql).toContain(`c.status::text <> 'MERGED'`);
      expect(sql).toContain('c.id = $2');
      expect(params).toEqual(['org-1', customerId]);
      expect(result).toBe(stubRows[0]);
    });

    it('không có dòng -> 404 tiếng Việt, KHÔNG nội suy id', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.findById(customerId, actor)).rejects.toThrow(
        new NotFoundException('Không tìm thấy khách hàng.'),
      );
    });
  });

  /**
   * Đường GHI uỷ quyền cho `CustomerService`, nên thứ kiểm ở đây là: tra
   * trùng TIẾNG VIỆT chạy trước, payload được nắn đúng hình dạng DTO của web,
   * và bản trả về đi qua `findById` (envelope mobile) chứ không phải entity.
   */
  describe('create', () => {
    const savedId = 'd0000000-0000-4000-8000-000000000009';

    beforeEach(() => {
      query.mockReset();
      customers.create.mockResolvedValue({ id: savedId });
    });

    it('SĐT trùng -> 409 tiếng Việt, KHÔNG gọi tới CustomerService', async () => {
      query.mockResolvedValueOnce([{ id: 'other' }]);

      await expect(
        service.create({ name: 'An', phone: '0901000002' }, actor),
      ).rejects.toThrow(
        new ConflictException(
          'Số điện thoại "0901000002" đã được dùng cho khách hàng khác.',
        ),
      );

      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('organization_id = $1');
      expect(sql).toContain('phone = $2');
      expect(params).toEqual(['org-1', '0901000002', null]);
      expect(customers.create).not.toHaveBeenCalled();
    });

    it('MÃ trùng -> 409 tiếng Việt thay vì 500 của đường web', async () => {
      query.mockResolvedValueOnce([{ id: 'other' }]);

      await expect(
        service.create({ name: 'An', code: 'KH000001' }, actor),
      ).rejects.toThrow(
        new ConflictException('Mã khách hàng "KH000001" đã tồn tại.'),
      );
      expect(query.mock.calls[0][0]).toContain('code = $2');
      expect(customers.create).not.toHaveBeenCalled();
    });

    it('email trùng -> 409 tiếng Việt', async () => {
      query.mockResolvedValueOnce([{ id: 'other' }]);

      await expect(
        service.create({ name: 'An', email: 'an@x.vn' }, actor),
      ).rejects.toThrow(ConflictException);
      expect(query.mock.calls[0][0]).toContain('email = $2');
    });

    it('nắn payload: trim, rỗng -> bỏ, status viết hoa, rồi trả bản ĐỌC LẠI', async () => {
      // Hai câu tra trùng rỗng, rồi `findById` trả một dòng.
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(stubRows);

      const result = await service.create(
        {
          code: '  ',
          name: '  Nguyễn Văn An ',
          phone: ' 0901000002 ',
          email: 'an@x.vn',
          address: '',
          birthDate: '1990-05-20',
          gender: 'male' as never,
          note: null,
          status: MobileCustomerStatus.INACTIVE,
        },
        actor,
      );

      expect(customers.create).toHaveBeenCalledWith(
        {
          code: null,
          name: 'Nguyễn Văn An',
          phone: '0901000002',
          email: 'an@x.vn',
          address: null,
          birthDate: '1990-05-20',
          gender: 'male',
          note: null,
          status: 'INACTIVE',
        },
        actor,
      );
      // Bản trả về là kết quả `findById` (có doanh thu, tên hạng thẻ), tra
      // đúng id vừa lưu.
      const [findSql, findParams] = query.mock.calls[2] as [string, unknown[]];
      expect(findSql).toContain('c.id = $2');
      expect(findParams).toEqual(['org-1', savedId]);
      expect(result).toBe(stubRows[0]);
    });

    it('vắng status -> ACTIVE', async () => {
      query.mockResolvedValueOnce(stubRows);

      await service.create({ name: 'An' }, actor);

      expect(customers.create.mock.calls[0][0].status).toBe('ACTIVE');
    });
  });

  describe('update', () => {
    const customerId = 'd0000000-0000-4000-8000-000000000005';

    beforeEach(() => {
      query.mockReset();
      customers.update.mockResolvedValue({ id: customerId });
    });

    it('id không có -> 404 tiếng Việt TRƯỚC khi làm gì khác', async () => {
      query.mockResolvedValueOnce([]);

      await expect(
        service.update(customerId, { name: 'An' }, actor),
      ).rejects.toThrow(new NotFoundException('Không tìm thấy khách hàng.'));
      expect(customers.update).not.toHaveBeenCalled();
    });

    it('tra trùng LOẠI chính bản ghi đang sửa', async () => {
      query
        .mockResolvedValueOnce(stubRows) // findById
        .mockResolvedValueOnce([]) // phone
        .mockResolvedValueOnce(stubRows); // findById sau khi lưu

      await service.update(customerId, { phone: '0901000002' }, actor);

      const [, params] = query.mock.calls[1] as [string, unknown[]];
      expect(params).toEqual(['org-1', '0901000002', customerId]);
    });

    it('vắng khoá = GIỮ NGUYÊN; null = XOÁ TRẮNG; status viết hoa', async () => {
      query
        .mockResolvedValueOnce(stubRows)
        .mockResolvedValueOnce(stubRows);

      await service.update(
        customerId,
        { phone: null, note: '', status: MobileCustomerStatus.ACTIVE },
        actor,
      );

      // KHÔNG có `name`/`email`/... trong payload: vắng khoá là giữ nguyên.
      expect(customers.update).toHaveBeenCalledWith(
        customerId,
        { phone: null, note: null, status: 'ACTIVE' },
        actor,
      );
      // `phone: null` không tra trùng — không có gì để đụng.
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('SĐT trùng khách khác -> 409 tiếng Việt, không lưu', async () => {
      query
        .mockResolvedValueOnce(stubRows)
        .mockResolvedValueOnce([{ id: 'other' }]);

      await expect(
        service.update(customerId, { phone: '0901000002' }, actor),
      ).rejects.toThrow(ConflictException);
      expect(customers.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const customerId = 'd0000000-0000-4000-8000-000000000005';

    beforeEach(() => query.mockReset());

    it('xoá CỨNG theo org + id sau khi tra thấy', async () => {
      query.mockResolvedValueOnce(stubRows).mockResolvedValueOnce([]);

      await service.remove(customerId, actor);

      const [sql, params] = query.mock.calls[1] as [string, unknown[]];
      expect(sql).toContain('DELETE FROM customers');
      expect(sql).toContain('organization_id = $1');
      expect(sql).toContain('id = $2');
      expect(params).toEqual(['org-1', customerId]);
    });

    it('id không có (hoặc đã gộp) -> 404 tiếng Việt, KHÔNG chạy DELETE', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.remove(customerId, actor)).rejects.toThrow(
        new NotFoundException('Không tìm thấy khách hàng.'),
      );
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('FK chặn (23503: công nợ / tín dụng / gộp) -> 409 tiếng Việt', async () => {
      const fk = Object.assign(new QueryFailedError('DELETE', [], new Error('fk')), {
        code: '23503',
      });
      query.mockResolvedValueOnce(stubRows).mockRejectedValueOnce(fk);

      await expect(service.remove(customerId, actor)).rejects.toThrow(
        new ConflictException(
          'Khách hàng đang có công nợ, tín dụng hoặc bản ghi liên quan, không thể xoá.',
        ),
      );
    });

    it('lỗi KHÁC đi qua nguyên vẹn', async () => {
      const boom = new Error('db down');
      query.mockResolvedValueOnce(stubRows).mockRejectedValueOnce(boom);

      await expect(service.remove(customerId, actor)).rejects.toBe(boom);
    });
  });
});
