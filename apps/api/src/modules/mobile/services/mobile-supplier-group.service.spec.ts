import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ProviderGroupCrudService } from '../../inventory/location/supplier-group-crud.service';
import { SupplierGroupEntity } from '../../inventory/location/supplier-group.entity';
import { MobileSupplierGroupService } from './mobile-supplier-group.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1'],
  roles: [],
};

function group(overrides: Partial<SupplierGroupEntity> = {}): SupplierGroupEntity {
  return {
    id: 'g-1',
    code: 'NCC-MN',
    name: 'Miền Nam',
    organizationId: 'org-1',
    isActive: true,
    ...overrides,
  } as unknown as SupplierGroupEntity;
}

/**
 * Khoá LUẬT TRUY VẤN và phép nắn payload của danh mục nhóm nhà cung cấp.
 *
 * KHÔNG kiểm lại hình dạng DTO — `mobile.e2e-spec.ts` phủ nó trên dữ liệu thật,
 * đúng phân công mà `mobile-supplier.service.spec.ts` đã khai.
 */
describe('MobileSupplierGroupService', () => {
  let service: MobileSupplierGroupService;
  let repo: Record<string, jest.Mock>;
  let crud: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = { find: jest.fn().mockResolvedValue([group()]) };
    crud = {
      create: jest.fn().mockResolvedValue(group()),
      update: jest.fn().mockResolvedValue(group()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileSupplierGroupService,
        { provide: getRepositoryToken(SupplierGroupEntity), useValue: repo },
        { provide: ProviderGroupCrudService, useValue: crud },
      ],
    }).compile();

    service = module.get(MobileSupplierGroupService);
  });

  describe('list', () => {
    it('lọc theo organizationId của actor — đường này KHÔNG qua applyScoping', async () => {
      await service.list(actor);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('sắp code -> name -> id; khoá phụ `id` giữ thứ tự ổn định giữa hai lượt gọi', async () => {
      await service.list(actor);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { code: 'ASC', name: 'ASC', id: 'ASC' },
        }),
      );
    });

    /**
     * Test này tồn tại để CHẶN một lần "dọn dẹp": thêm `isActive: true` vào
     * `where` trông rất hợp lý, nhưng khi đó nhãn của một nhà cung cấp đang gắn
     * nhóm đã ngừng theo dõi sẽ thành khoảng trắng — app không tra ra id đó
     * trong danh mục nữa.
     */
    it('KHÔNG lọc isActive — app cần tra được nhãn của nhóm đang gắn', async () => {
      await service.list(actor);

      const arg = repo.find.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(arg.where).not.toHaveProperty('isActive');
    });

    it('bọc trong { data: [...] }, không trả mảng trần', async () => {
      const result = await service.list(actor);

      expect(result).toEqual({
        data: [
          {
            id: 'g-1',
            code: 'NCC-MN',
            name: 'Miền Nam',
            parentGroupId: null,
            description: null,
            isActive: true,
          },
        ],
      });
    });
  });

  describe('create', () => {
    it('cắt khoảng trắng của mã và tên', async () => {
      await service.create({ code: '  NCC-MN  ', name: '  Miền Nam  ' }, actor);

      expect(crud.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NCC-MN', name: 'Miền Nam' }),
        actor,
      );
    });

    it('vắng nhóm cha -> undefined, không phải null', async () => {
      await service.create({ code: 'NCC-MN', name: 'Miền Nam' }, actor);

      expect(crud.create).toHaveBeenCalledWith(
        expect.objectContaining({ parentGroupId: undefined }),
        actor,
      );
    });

    it('mã trùng -> 409 nói TIẾNG VIỆT và nhắc lại mã', async () => {
      // `BaseCrudService` đã bắt `23505` và bọc thành ConflictException TIẾNG
      // ANH; app hiện thẳng `message` lên toast nên câu đó không dùng được.
      crud.create.mockRejectedValue(
        new ConflictException('A record with the same unique code already exists'),
      );

      await expect(
        service.create({ code: 'NCC-MN', name: 'Miền Nam' }, actor),
      ).rejects.toThrow('Mã nhóm nhà cung cấp "NCC-MN" đã tồn tại.');
    });
  });

  describe('update', () => {
    /**
     * Ca ĐẮT NHẤT của cả file: `null` là "đưa nhóm này lên làm nhóm gốc", và nó
     * phải đi qua NGUYÊN VẸN. Nắn nó về `undefined` ở bất kỳ đâu trên đường đi
     * là `repository.merge` của TypeORM bỏ qua, và thao tác trả 200 OK mà không
     * đổi gì.
     */
    it('parentGroupId: null đi qua NGUYÊN VẸN — đó là "đưa lên nhóm gốc"', async () => {
      await service.update('g-1', { parentGroupId: null }, actor);

      const payload = crud.update.mock.calls[0][1] as Record<string, unknown>;
      expect(payload).toHaveProperty('parentGroupId', null);
    });

    it('vắng khoá nào thì payload KHÔNG có khoá đó — "giữ nguyên", không phải "xoá"', async () => {
      await service.update('g-1', { name: 'Miền Nam mới' }, actor);

      const payload = crud.update.mock.calls[0][1] as Record<string, unknown>;
      expect(payload).toEqual({ name: 'Miền Nam mới' });
      expect(payload).not.toHaveProperty('parentGroupId');
      expect(payload).not.toHaveProperty('code');
    });

    it('description: null -> null (xoá trắng ô mô tả)', async () => {
      await service.update('g-1', { description: null }, actor);

      const payload = crud.update.mock.calls[0][1] as Record<string, unknown>;
      expect(payload).toHaveProperty('description', null);
    });
  });
});
