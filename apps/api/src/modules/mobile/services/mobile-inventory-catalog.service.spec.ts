import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryItemCategoryCrudService } from '../../inventory/location/item-category-crud.service';
import { UnitOfMeasureCrudService } from '../../inventory/location/unit-of-measure-crud.service';
import { MobileInventoryCatalogService } from './mobile-inventory-catalog.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

describe('MobileInventoryCatalogService', () => {
  let service: MobileInventoryCatalogService;
  let query: jest.Mock;
  let createUnit: jest.Mock;
  let createCategory: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);
    createUnit = jest.fn();
    createCategory = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileInventoryCatalogService,
        { provide: getDataSourceToken(), useValue: { query } },
        // Hai service GHI được uỷ quyền — stub, vì phần đáng kiểm ở đây là
        // service này gọi chúng với gì và nắn kết quả ra sao, không phải logic
        // bên trong chúng (đã có spec riêng).
        { provide: UnitOfMeasureCrudService, useValue: { create: createUnit } },
        {
          provide: InventoryItemCategoryCrudService,
          useValue: { create: createCategory },
        },
      ],
    }).compile();
    service = module.get(MobileInventoryCatalogService);
  });

  const sql = (): string => query.mock.calls[0][0] as string;
  const params = (): unknown[] => query.mock.calls[0][1] as unknown[];

  it('nhóm hàng: scope $1, chỉ ACTIVE, ba cột app cần, sắp theo mã rồi tên', async () => {
    await service.listCategories(actor);

    expect(params()).toEqual(['org-1']);
    expect(sql()).toContain('c.organization_id = $1');
    expect(sql()).toContain("c.status = 'ACTIVE'");
    expect(sql()).toContain('c.parent_group_id::text AS "parentId"');
    expect(sql()).toContain('ORDER BY c.code ASC NULLS LAST, c.name ASC, c.id ASC');
    expect(sql()).not.toContain('description');
  });

  it('đơn vị: HỢP items.unit với danh mục inventory_units, gộp không phân biệt hoa/thường', async () => {
    await service.listUnits(actor);

    expect(params()).toEqual(['org-1']);

    // Nguồn 1 — đơn vị đang dùng. Bỏ nó đi là bộ lọc tồn kho mất mọi lựa chọn
    // có kết quả, vì `?unit=` đối chiếu đúng `lower(items.unit)`.
    expect(sql()).toContain('FROM items i');
    expect(sql()).toContain('lower(i.unit) AS code');
    expect(sql()).toContain("i.unit <> ''");

    // Nguồn 2 — danh mục đã khai. Đây là thứ làm màn "Thêm đơn vị tính" của
    // app không còn là ngõ cụt: đơn vị vừa tạo hiện ra dù chưa hàng hoá nào dùng.
    expect(sql()).toContain('FROM inventory_units u');
    expect(sql()).toContain('lower(u.name) AS code');

    // `is_active` CHỈ áp cho danh mục — một đơn vị đang nằm trên hàng hoá thật
    // vẫn phải chọn được dù ai đó đã ngừng theo dõi nó trong danh mục.
    expect(sql()).toContain('u.is_active = true');
    expect(sql()).not.toContain('i.is_active');

    expect(sql()).toContain('UNION ALL');
    expect(sql()).toContain('GROUP BY code');
  });

  it('tạo đơn vị: uỷ quyền, và code lấy từ TÊN ĐÃ GHI chứ không từ dto', async () => {
    // `beforeCreate` của service kia cắt khoảng trắng; lấy tên từ `dto` sẽ cho
    // `code` lệch một ký tự, và màn chọn không tô được dòng đang chọn.
    createUnit.mockResolvedValue({ id: 'u-1', name: 'Thùng' });

    const result = await service.createUnit(
      { name: '  Thùng  ', description: 'Mô tả' },
      actor,
    );

    expect(createUnit).toHaveBeenCalledWith(
      { name: '  Thùng  ', description: 'Mô tả' },
      actor,
    );
    expect(result).toEqual({ code: 'thùng', name: 'Thùng' });
  });

  it('tạo nhóm hàng: uỷ quyền kèm parentGroupId, trả hình dạng của listCategories', async () => {
    createCategory.mockResolvedValue({
      id: 'c-2',
      name: 'Giày nam',
      parentGroupId: 'c-1',
    });

    const result = await service.createCategory(
      { name: 'Giày nam', code: 'GN', parentGroupId: 'c-1' },
      actor,
    );

    // `parentGroupId` là tên mà service kia đọc — đổi sang `parentId` "cho
    // đồng bộ" với response là nhóm cha lặng lẽ bị bỏ qua.
    expect(createCategory).toHaveBeenCalledWith(
      {
        name: 'Giày nam',
        code: 'GN',
        parentGroupId: 'c-1',
        description: undefined,
      },
      actor,
    );

    // Khoá cha trả về là `parentGroupId` — tên của CÂY, không phải `parentId`
    // của danh sách phẳng. `ProductGroupModel` phía Dart đọc đúng tên này; trả
    // tên kia là một nhóm con lặng lẽ hiện lên như nhóm gốc.
    expect(result).toEqual({
      id: 'c-2',
      code: null,
      name: 'Giày nam',
      description: null,
      parentGroupId: 'c-1',
      status: 'ACTIVE',
      children: [],
    });
  });

  it('tạo nhóm gốc: parentGroupId vắng -> null, không phải undefined', async () => {
    createCategory.mockResolvedValue({ id: 'c-3', name: 'Phụ kiện' });

    const result = await service.createCategory({ name: 'Phụ kiện' }, actor);

    // `null` chứ không `undefined`: `undefined` biến mất khỏi JSON, nên app đọc
    // ra "thiếu trường" thay vì "đây là nhóm gốc".
    expect(result.parentGroupId).toBeNull();
    expect(result.children).toEqual([]);
  });

  it('tạo nhóm hàng: service kia trả bản ghi không có id -> ném, không trả rác', async () => {
    createCategory.mockResolvedValue({ name: 'Phụ kiện' });

    await expect(service.createCategory({ name: 'Phụ kiện' }, actor)).rejects.toThrow(
      /hợp đồng đã đổi/,
    );
  });
});
