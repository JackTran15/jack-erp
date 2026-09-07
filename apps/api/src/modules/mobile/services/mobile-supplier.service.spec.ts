import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ProviderEntity } from '../../inventory/location/provider.entity';
import { MobileSupplierSort } from '../dto/mobile-supplier-list.query.dto';
import { MobileSupplierService } from './mobile-supplier.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1'],
  roles: [],
};

function provider(overrides: Partial<ProviderEntity> = {}): ProviderEntity {
  return {
    id: 'p-1',
    code: 'ABA',
    name: 'AN BA',
    isActive: true,
    type: 'supplier',
    organizationId: 'org-1',
    ...overrides,
  } as unknown as ProviderEntity;
}

/**
 * Khoá phần ĐỌC của màn nhà cung cấp: phép tìm kiếm và thứ tự phân trang.
 *
 * KHÔNG kiểm lại phép ánh xạ sang DTO — `mobile.e2e-spec.ts` đã phủ nó trên
 * dữ liệu thật, và chép lại ở đây chỉ là viết `toMobileSupplier` lần thứ hai
 * dưới dạng khác.
 */
describe('MobileSupplierService', () => {
  let service: MobileSupplierService;
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[provider()], 1]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileSupplierService,
        {
          provide: getRepositoryToken(ProviderEntity),
          useValue: { createQueryBuilder: () => qb },
        },
      ],
    }).compile();

    service = module.get(MobileSupplierService);
  });

  const run = (
    query: {
      page?: number;
      limit?: number;
      sort?: MobileSupplierSort;
      search?: string;
    } = {},
  ) =>
    service.list(
      { page: 1, limit: 20, sort: MobileSupplierSort.NAME, ...query },
      actor,
    );

  /** Mọi mệnh đề `andWhere` đã gửi, gộp thành một chuỗi để tra nhanh. */
  const conditions = () => qb.andWhere.mock.calls.map((c) => c[0]).join(' | ');

  it('tìm kiếm tra CẢ mã lẫn tên', async () => {
    await run({ search: 'aba' });

    const where = conditions();
    expect(where).toContain('provider.code ILIKE');
    expect(where).toContain('provider.name ILIKE');
  });

  it('hai vế OR nằm trong MỘT mệnh đề, trong MỘT cặp ngoặc', async () => {
    await run({ search: 'aba' });

    // Tách thành hai `andWhere` là `OR` leo ra ngoài và vô hiệu hoá luôn điều
    // kiện `organizationId` — rò dữ liệu sang tổ chức khác, không chỉ sai kết
    // quả. Đây là lý do test này tồn tại.
    const orClauses = qb.andWhere.mock.calls.filter((c) =>
      String(c[0]).includes('ILIKE'),
    );

    expect(orClauses).toHaveLength(1);
    expect(orClauses[0][0]).toMatch(/^\(.*\)$/);
  });

  it('bọc `%` hai đầu và CẮT khoảng trắng thừa', async () => {
    await run({ search: '  aba  ' });

    const [, params] = qb.andWhere.mock.calls.find((c) =>
      String(c[0]).includes('ILIKE'),
    )!;

    expect(Object.values(params)).toEqual(['%aba%']);
  });

  it('escape `%` và `_` — người dùng gõ chúng là KÝ TỰ, không phải ký tự đại diện', async () => {
    await run({ search: '50%_off' });

    const [, params] = qb.andWhere.mock.calls.find((c) =>
      String(c[0]).includes('ILIKE'),
    )!;

    // Chưa escape thì gõ đúng một dấu `%` là khớp TOÀN BỘ danh sách — đã đo
    // được trên API thật trước khi vá.
    expect(Object.values(params)).toEqual(['%50\\%\\_off%']);
  });

  it('tìm kiếm rỗng hoặc toàn khoảng trắng thì KHÔNG thêm mệnh đề', async () => {
    await run({ search: '   ' });

    expect(conditions()).not.toContain('ILIKE');
  });

  it('sắp theo TÊN mặc định, theo MÃ khi màn chọn yêu cầu', async () => {
    await run();
    expect(qb.orderBy).toHaveBeenCalledWith('provider.name', 'ASC');

    qb.orderBy.mockClear();

    await run({ sort: MobileSupplierSort.CODE });
    expect(qb.orderBy).toHaveBeenCalledWith('provider.code', 'ASC');
  });

  it('sắp xếp có KHOÁ PHỤ `id` — nếu không thì phân trang lặp dòng', async () => {
    await run();

    // Trùng TÊN nhà cung cấp là chuyện có thật, và Postgres không hứa thứ tự
    // nào giữa các dòng bằng nhau: không có khoá phụ thì một bản ghi hiện ở cả
    // trang 1 lẫn trang 2, một bản ghi khác biến mất khỏi cả hai.
    expect(qb.addOrderBy).toHaveBeenCalledWith('provider.id', 'ASC');
  });

  it('phân trang tính đúng offset', async () => {
    await run({ page: 3, limit: 20 });

    expect(qb.skip).toHaveBeenCalledWith(40);
    expect(qb.take).toHaveBeenCalledWith(20);
  });
});
