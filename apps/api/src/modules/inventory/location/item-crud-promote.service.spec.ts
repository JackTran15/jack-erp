import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryItemCrudService } from './item-crud.service';
import { ItemEntity } from './item.entity';
import { ItemCategoryEntity } from './item-category.entity';
import { BrandEntity } from './brand.entity';
import { LocationEntity } from './location.entity';
import { ProductEntity } from '../product/product.entity';
import { ItemBarcodeEntity } from './item-barcode.entity';
import { ProductAttributeDefinitionEntity } from '../product/product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from '../product/product-attribute-option.entity';
import { ItemAttributeValueEntity } from '../product/item-attribute-value.entity';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { CacheService } from '../../redis/cache.service';

/**
 * Khoá nhánh THĂNG CẤP: sửa một MẶT HÀNG LẺ và gửi kèm `colors`/`sizes` thì nó
 * phải thành một MẪU MÃ có biến thể — không phải bị vứt trong im lặng.
 *
 * Bản trước không có nhánh này: `update` destructure `{ colors: _c, sizes: _s }`
 * rồi bỏ đi, nên server trả 200 và thuộc tính biến mất. Người dùng chỉ phát hiện
 * khi mở lại bản ghi. Đó là kiểu hỏng mà chỉ test mới giữ được.
 */
describe('InventoryItemCrudService.update (thăng cấp mặt hàng lẻ)', () => {
  let service: InventoryItemCrudService;
  let itemRepo: Record<string, jest.Mock>;
  let productRepo: Record<string, jest.Mock>;
  let attrValRepo: Record<string, jest.Mock>;

  const actor = {
    userId: 'u1',
    organizationId: 'org-1',
    branchId: 'b1',
    roles: [],
    permissions: [],
  };

  /** Mặt hàng lẻ đang có: mang mã, tên và (ngầm hiểu) cả tồn kho, lịch sử. */
  const existingItem = {
    id: 'item-existing',
    code: 'AOTHUN',
    name: 'Áo thun',
    isActive: true,
    productId: null as string | null,
    variantLabel: null as string | undefined | null,
  };

  const qbNull = () => {
    const qb: Record<string, jest.Mock> = {};
    [
      'where',
      'andWhere',
      'select',
      'innerJoin',
      'leftJoinAndSelect',
      'groupBy',
      'having',
      'distinct',
      'orderBy',
      'limit',
    ].forEach((m) => (qb[m] = jest.fn().mockReturnValue(qb)));
    qb.getOne = jest.fn().mockResolvedValue(null);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    // `variantExists` đếm qua đây — 0 nghĩa là chưa tổ hợp nào tồn tại.
    qb.getCount = jest.fn().mockResolvedValue(0);
    return qb;
  };

  const idGen = (prefix: string) => {
    let n = 0;
    return jest
      .fn()
      .mockImplementation((e: Record<string, unknown>) =>
        Promise.resolve({ ...e, id: (e as { id?: string }).id ?? `${prefix}-${++n}` }),
      );
  };

  beforeEach(async () => {
    itemRepo = {
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: idGen('item'),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue({ ...existingItem }),
      createQueryBuilder: jest.fn().mockImplementation(() => qbNull()),
      // `BaseCrudService.update` dùng `merge` ở đường sửa item thường.
      merge: jest.fn().mockImplementation((a, b) => ({ ...a, ...b })),
    };
    productRepo = {
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: jest.fn().mockImplementation((e) => Promise.resolve({ ...e, id: 'prod-new' })),
      findOne: jest.fn().mockResolvedValue({
        id: 'prod-new',
        code: 'AOTHUN',
        name: 'Áo thun',
        isActive: true,
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      // `id` truyền vào là ITEM id -> KHÔNG phải product uuid.
      exist: jest.fn().mockResolvedValue(false),
    };
    attrValRepo = {
      createQueryBuilder: jest.fn().mockImplementation(() => qbNull()),
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: idGen('attrval'),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const attrRepo = () => ({
      createQueryBuilder: jest.fn().mockImplementation(() => qbNull()),
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: idGen('attr'),
      findOne: jest.fn().mockResolvedValue(null),
    });

    const dataSource = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === ProductEntity) return productRepo;
        if (entity === ItemBarcodeEntity) {
          return { create: jest.fn(), save: jest.fn(), delete: jest.fn() };
        }
        return itemRepo;
      }),
      transaction: jest.fn(),
      // Ba ca "KHÔNG thăng cấp" rơi xuống đường sửa item thường, và đường đó
      // đọc snapshot tồn đầu kỳ bằng SQL thô.
      query: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryItemCrudService,
        { provide: getRepositoryToken(ItemEntity), useValue: itemRepo },
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: 'cat' }) },
        },
        {
          provide: getRepositoryToken(BrandEntity),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: 'brand-1', name: 'Nike' }) },
        },
        {
          provide: getRepositoryToken(LocationEntity),
          useValue: { createQueryBuilder: jest.fn().mockImplementation(() => qbNull()) },
        },
        {
          provide: getRepositoryToken(ProductAttributeDefinitionEntity),
          useValue: attrRepo(),
        },
        {
          provide: getRepositoryToken(ProductAttributeOptionEntity),
          useValue: attrRepo(),
        },
        { provide: getRepositoryToken(ItemAttributeValueEntity), useValue: attrValRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: { recordMovement: jest.fn() } },
        { provide: CacheService, useValue: { invalidate: jest.fn(), getOrSet: jest.fn() } },
      ],
    }).compile();

    service = module.get(InventoryItemCrudService);
  });

  it('tạo MẪU MÃ mới và trả về productId, không còn im lặng bỏ qua', async () => {
    const result = await service.update(
      'item-existing',
      { name: 'Áo thun', unit: 'Cái', colors: ['Đỏ', 'Xanh'], sizes: ['M'] },
      actor,
    );

    expect(productRepo.save).toHaveBeenCalled();
    expect(result).toMatchObject({ productId: 'prod-new' });
  });

  it('GIỮ NGUYÊN id và code của bản ghi cũ — nó mang tồn kho và lịch sử', async () => {
    await service.update(
      'item-existing',
      { name: 'Áo thun', unit: 'Cái', colors: ['Đỏ'], sizes: ['M'] },
      actor,
    );

    // Bản ghi cũ được NỐI vào mẫu mã, không bị thay bằng một item mới: đổi mã
    // là mọi phiếu đã lập trỏ vào một SKU không còn tồn tại.
    const attached = itemRepo.save.mock.calls
      .map(([entity]) => entity as Record<string, unknown>)
      .find((entity) => entity.id === 'item-existing');

    expect(attached).toBeDefined();
    expect(attached!.productId).toBe('prod-new');
    expect(attached!.code).toBe('AOTHUN');
  });

  it('mẫu mã kế thừa mã của item cũ', async () => {
    await service.update(
      'item-existing',
      { name: 'Áo thun', unit: 'Cái', colors: ['Đỏ'] },
      actor,
    );

    expect(productRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AOTHUN', name: 'Áo thun' }),
    );
  });

  it('tổ hợp ĐẦU gán cho item cũ, nên nó có dòng thuộc tính', async () => {
    await service.update(
      'item-existing',
      { name: 'Áo thun', unit: 'Cái', colors: ['Đỏ'], sizes: ['M'] },
      actor,
    );

    const targets = attrValRepo.save.mock.calls.map(
      ([entity]) => (entity as { itemId: string }).itemId,
    );

    expect(targets).toContain('item-existing');
  });

  it('mảng RỖNG KHÔNG thăng cấp — không có chiều nào thì không có gì để phân loại', async () => {
    await service.update(
      'item-existing',
      { name: 'Áo thun', unit: 'Cái', colors: [], sizes: [] },
      actor,
    );

    // `colors: []` nghĩa là "không có chiều nào". Thăng cấp ở ca này là đổi
    // hình dạng bản ghi mà chẳng đổi lấy gì.
    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('chuỗi toàn khoảng trắng cũng KHÔNG tính là một chiều', async () => {
    await service.update(
      'item-existing',
      { name: 'Áo thun', unit: 'Cái', colors: ['   '] },
      actor,
    );

    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('KHÔNG có colors/sizes -> đi đường sửa item thường như cũ', async () => {
    await service.update('item-existing', { name: 'Áo thun mới', unit: 'Cái' }, actor);

    expect(productRepo.save).not.toHaveBeenCalled();
  });
});
