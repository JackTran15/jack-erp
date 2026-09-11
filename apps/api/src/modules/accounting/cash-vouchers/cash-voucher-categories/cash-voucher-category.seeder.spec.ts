import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CashVoucherCategoryDirection } from '../enums';
import { CashVoucherCategoryEntity } from './cash-voucher-category.entity';
import {
  CashVoucherCategorySeederService,
  DEFAULT_CASH_VOUCHER_CATEGORIES,
} from './cash-voucher-category.seeder';

const namesInOrder = (direction: CashVoucherCategoryDirection): string[] =>
  DEFAULT_CASH_VOUCHER_CATEGORIES.filter((c) => c.direction === direction)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((c) => c.name);

describe('DEFAULT_CASH_VOUCHER_CATEGORIES', () => {
  it('has unique codes that fit code varchar(32)', () => {
    const codes = DEFAULT_CASH_VOUCHER_CATEGORIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code.length).toBeLessThanOrEqual(32);
    }
  });

  it('has unique display orders', () => {
    const orders = DEFAULT_CASH_VOUCHER_CATEGORIES.map((c) => c.displayOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('lists Mục thu in order', () => {
    expect(namesInOrder(CashVoucherCategoryDirection.IN)).toEqual([
      'Thu từ bán hàng',
      'Thu khác',
      'Thu thanh lý tài sản',
      'Thu từ bán phế liệu',
      'Thu hoàn ứng',
      'Thu từ cửa hàng khác chuyển đến',
      'Thu nhận tiền mặt về nhập quỹ',
      'Thu nhận tiền gửi vào ngân hàng',
      'Thu nợ khách hàng',
    ]);
  });

  // The user-supplied list (six screenshots, in order), then the two system
  // categories that list doesn't carry.
  it('lists Mục chi in the order the user supplied', () => {
    expect(namesInOrder(CashVoucherCategoryDirection.OUT)).toEqual([
      'Tiền điện',
      'Tiền điện thoại',
      'Tiền internet',
      'Tiền nước sinh hoạt',
      'Tiền thuê cửa hàng',
      'Tiền vận chuyển',
      'Mua dụng cụ sửa dép',
      'Tiền lương',
      'Tiền thưởng',
      'Tiền phụ cấp',
      'Ứng lương',
      'Mua đồ dùng, công cụ, dụng cụ',
      'Tài sản cố định',
      'Mua máy móc thiết bị',
      'Chi khác',
      'Chi tiếp khách',
      'Mua văn phòng phẩm',
      'Chi tạm ứng',
      'Thuê mướn khác',
      'Chi vệ sinh môi trường',
      'Chi lý do khác',
      'Chi mua hàng hóa',
      'Chi chuyển tiền sang cửa hàng khác',
      'Rút tiền gửi về nhập quỹ',
      'Chi gửi tiền vào ngân hàng',
      'Chi ăn uống',
      'Mua xăng dầu nhớt',
      'Nạp VETC',
      'Làm Hàng',
      'Đồ dùng vệ sinh',
      'Tiền ăn',
      'Tiền nước uống',
      'Chi trả nợ nhà cung cấp',
      'Phí ngân hàng',
    ]);
  });

  it('renames CHI_TIEN_NUOC and CHI_CCDC without changing their codes', () => {
    const byCode = new Map(
      DEFAULT_CASH_VOUCHER_CATEGORIES.map((c) => [c.code, c.name]),
    );
    expect(byCode.get('CHI_TIEN_NUOC')).toBe('Tiền nước sinh hoạt');
    expect(byCode.get('CHI_CCDC')).toBe('Mua đồ dùng, công cụ, dụng cụ');
  });

  it('keeps the codes system-generated vouchers resolve by', () => {
    const codes = DEFAULT_CASH_VOUCHER_CATEGORIES.map((c) => c.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'THU_KHAC',
        'THU_NO_KH',
        'CHI_KHAC',
        'CHI_MUA_HANG',
        'CHI_NO_NCC',
        'BANK_FEE',
      ]),
    );
  });
});

describe('CashVoucherCategorySeederService', () => {
  let service: CashVoucherCategorySeederService;
  let categoryRepo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    categoryRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entities) => Promise.resolve(entities)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashVoucherCategorySeederService,
        {
          provide: getRepositoryToken(CashVoucherCategoryEntity),
          useValue: categoryRepo,
        },
      ],
    }).compile();

    service = module.get(CashVoucherCategorySeederService);
  });

  describe('seedForOrganization', () => {
    it('seeds all 43 default categories for an empty organization', async () => {
      const created = await service.seedForOrganization('org-new', 'user-1');

      expect(created).toBe(43);
      expect(categoryRepo.save).toHaveBeenCalledTimes(1);
      const saved = categoryRepo.save.mock.calls[0][0];
      expect(
        saved.map((c: any) => ({
          code: c.code,
          name: c.name,
          direction: c.direction,
          displayOrder: c.displayOrder,
        })),
      ).toEqual(DEFAULT_CASH_VOUCHER_CATEGORIES);
      for (const c of saved) {
        expect(c).toMatchObject({
          organizationId: 'org-new',
          isActive: true,
          createdBy: 'user-1',
        });
      }
    });

    it('inserts nothing when every code exists, soft-deleted rows included', async () => {
      categoryRepo.find.mockResolvedValue(
        DEFAULT_CASH_VOUCHER_CATEGORIES.map((c) => ({ code: c.code })),
      );

      const created = await service.seedForOrganization('org-1', 'user-1');

      expect(created).toBe(0);
      expect(categoryRepo.save).not.toHaveBeenCalled();
      expect(categoryRepo.find).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        withDeleted: true,
      });
    });

    it('tops up only the missing codes', async () => {
      categoryRepo.find.mockResolvedValue(
        DEFAULT_CASH_VOUCHER_CATEGORIES.filter(
          (c) => c.code !== 'CHI_UNG_LUONG',
        ).map((c) => ({ code: c.code })),
      );

      const created = await service.seedForOrganization('org-1', 'user-1');

      expect(created).toBe(1);
      expect(categoryRepo.save.mock.calls[0][0].map((c: any) => c.code)).toEqual([
        'CHI_UNG_LUONG',
      ]);
    });
  });
});
