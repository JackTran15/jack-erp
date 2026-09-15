import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryFailedError } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CustomerGroupEntity } from '../../customer/customer-group.entity';
import { CustomerGroupService } from '../../customer/customer-group.service';
import { MobileCustomerGroupService } from './mobile-customer-group.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

function group(overrides: Partial<CustomerGroupEntity> = {}): CustomerGroupEntity {
  return {
    id: 'g-1',
    code: 'NKH000001',
    name: 'Khách sỉ',
    description: null,
    organizationId: 'org-1',
    branchId: 'branch-1',
    createdBy: 'admin-1',
    createdAt: new Date(),
    ...overrides,
  } as unknown as CustomerGroupEntity;
}

/**
 * Lớp này uỷ quyền gần trọn cho `CustomerGroupService`, nên phần đáng khoá chỉ
 * còn hai thứ: **hình dạng cắt ra** và **phép dịch lỗi trùng**. Hình dạng đầy
 * đủ do `mobile.e2e-spec.ts` phủ trên dữ liệu thật.
 */
describe('MobileCustomerGroupService', () => {
  let service: MobileCustomerGroupService;
  let groups: { findAll: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    groups = {
      findAll: jest.fn().mockResolvedValue([group()]),
      create: jest.fn().mockResolvedValue(group()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileCustomerGroupService,
        { provide: CustomerGroupService, useValue: groups },
      ],
    }).compile();

    service = module.get(MobileCustomerGroupService);
  });

  describe('list', () => {
    it('bọc { data: [...] }, KHÔNG trả mảng trần', async () => {
      const result = await service.list(actor);

      expect(Object.keys(result)).toEqual(['data']);
    });

    /**
     * Bản ghi gốc mang cả `organizationId`, `branchId`, `createdBy`,
     * `createdAt`. Trả thẳng nó ra là rò cột hạ tầng cho client — và đó chính
     * là một trong hai lý do không dùng lại `/customers/groups`.
     */
    it('cắt còn ĐÚNG bốn trường, không rò cột hạ tầng', async () => {
      const result = await service.list(actor);

      expect(result.data).toEqual([
        { id: 'g-1', code: 'NKH000001', name: 'Khách sỉ', description: null },
      ]);
    });

    it('code chưa backfill -> null, không phải chuỗi rỗng', async () => {
      groups.findAll.mockResolvedValue([group({ code: undefined })]);

      const result = await service.list(actor);

      expect(result.data[0].code).toBeNull();
    });

    it('chuyển đúng actor xuống service gốc — scope theo tổ chức nằm ở đó', async () => {
      await service.list(actor);

      expect(groups.findAll).toHaveBeenCalledWith(actor);
    });
  });

  describe('create', () => {
    it('cắt khoảng trắng của tên', async () => {
      await service.create({ name: '  Khách sỉ  ' }, actor);

      expect(groups.create).toHaveBeenCalledWith(
        { name: 'Khách sỉ', description: undefined },
        actor,
      );
    });

    /**
     * Mã do `DocumentNumberingService` cấp. Test này tồn tại để chặn một lần
     * "cho tiện": thêm `code` vào DTO rồi chuyển tiếp xuống đây là phá bộ đếm.
     */
    it('KHÔNG gửi `code` xuống service gốc — server tự cấp', async () => {
      await service.create({ name: 'Khách sỉ' }, actor);

      expect(groups.create.mock.calls[0][0]).not.toHaveProperty('code');
    });

    it('trùng TÊN -> 409 nói TIẾNG VIỆT và nhắc lại tên', async () => {
      // Khoá bị đụng là `uq_customer_group_org_name` — TÊN, không phải mã.
      // `CustomerGroupService` không bắt `23505` nên không chặn ở đây là 500.
      const dup = Object.assign(
        new QueryFailedError('INSERT', [], new Error('dup')),
        { code: '23505' },
      );
      groups.create.mockRejectedValue(dup);

      await expect(service.create({ name: 'Khách sỉ' }, actor)).rejects.toThrow(
        new ConflictException('Nhóm khách hàng "Khách sỉ" đã tồn tại.'),
      );
    });

    it('lỗi KHÁC đi qua nguyên vẹn', async () => {
      const boom = new Error('db down');
      groups.create.mockRejectedValue(boom);

      await expect(service.create({ name: 'A' }, actor)).rejects.toBe(boom);
    });
  });
});
