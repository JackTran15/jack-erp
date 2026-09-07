import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../../inventory/location/item.entity';
import { MobileItemService } from './mobile-item.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1'],
  roles: [],
};

/** Một item như repository trả về — CỐ Ý mang cả field không được rò. */
function item(overrides: Partial<ItemEntity> = {}): ItemEntity {
  return {
    id: 'i-1',
    code: 'GELLI-39-NAU',
    name: 'Giày Gelli (39 · Nâu)',
    variantLabel: '39 · Nâu',
    unit: 'đôi',
    purchasePrice: '350000.00',
    sellingPrice: '590000.00',
    weightGram: 800,
    manufactureYear: 2026,
    composition: 'Da thật',
    organizationId: 'org-1',
    isActive: true,
    ...overrides,
  } as unknown as ItemEntity;
}

describe('MobileItemService', () => {
  let service: MobileItemService;
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[item()], 1]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileItemService,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { createQueryBuilder: () => qb },
        },
      ],
    }).compile();

    service = module.get(MobileItemService);
  });

  const run = (query: { page?: number; limit?: number; search?: string } = {}) =>
    service.list({ page: 1, limit: 20, ...query }, actor);

  /** Mọi mệnh đề `andWhere` đã gửi, gộp thành một chuỗi để tra nhanh. */
  const conditions = () => qb.andWhere.mock.calls.map((c) => c[0]).join(' | ');

  it('trả ĐÚNG năm trường — không rò giá bán, cân nặng, chất liệu', async () => {
    const { data } = await run();

    expect(Object.keys(data[0]).sort()).toEqual([
      'code',
      'id',
      'name',
      'purchasePrice',
      'unit',
      'variantLabel',
    ]);

    const serialized = JSON.stringify(data[0]);
    for (const leak of ['sellingPrice', 'weightGram', 'composition', 'manufactureYear']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('`purchasePrice` về đúng KIỂU SỐ, không phải chuỗi của Postgres', async () => {
    const { data } = await run();

    // Cột `decimal` về Node dưới dạng chuỗi; để nguyên thì ô đơn giá của app
    // nhận "350000.00" và mọi phép cộng thành nối chuỗi.
    expect(typeof data[0].purchasePrice).toBe('number');
    expect(data[0].purchasePrice).toBe(350000);
  });

  it('LOẠI hàng đã ngừng kinh doanh — đây là màn lập phiếu, không phải danh mục', async () => {
    await run();

    expect(conditions()).toContain('item.isActive = true');
  });

  it('tìm kiếm tra cả MÃ, TÊN và NHÃN BIẾN THỂ', async () => {
    await run({ search: 'gelli' });

    const where = conditions();
    // Người lập phiếu gõ mã nhiều hơn gõ tên, và nhãn biến thể là thứ phân
    // biệt sáu dòng cùng tên với nhau.
    expect(where).toContain('item.code ILIKE');
    expect(where).toContain('item.name ILIKE');
    expect(where).toContain('item.variantLabel ILIKE');
  });

  it('escape `%` và `_` — người dùng gõ chúng là KÝ TỰ, không phải ký tự đại diện', async () => {
    await run({ search: '50%_off' });

    const [, params] = qb.andWhere.mock.calls.find((c) =>
      String(c[0]).includes('ILIKE'),
    )!;

    expect(Object.values(params)).toEqual(['%50\\%\\_off%']);
  });

  it('tìm kiếm rỗng hoặc toàn khoảng trắng thì KHÔNG thêm mệnh đề', async () => {
    await run({ search: '   ' });

    expect(conditions()).not.toContain('ILIKE');
  });

  it('sắp xếp có KHOÁ PHỤ `id` — nếu không thì phân trang lặp dòng', async () => {
    await run();

    // Sáu biến thể của một mẫu mã chỉ khác nhau ở nhãn, nên `name` trùng nhau
    // rất nhiều. `LIMIT/OFFSET` trên thứ tự không duy nhất thì Postgres được
    // phép trả khác nhau giữa hai lượt.
    expect(qb.orderBy).toHaveBeenCalledWith('lower(item.name)', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('item.id', 'ASC');
  });

  it('phân trang tính đúng offset', async () => {
    await run({ page: 3, limit: 20 });

    expect(qb.skip).toHaveBeenCalledWith(40);
    expect(qb.take).toHaveBeenCalledWith(20);
  });

  it('hàng KHÔNG có biến thể trả `variantLabel` null', async () => {
    qb.getManyAndCount.mockResolvedValue([[item({ variantLabel: undefined })], 1]);

    const { data } = await run();

    expect(data[0].variantLabel).toBeNull();
  });
});
