import { Test, TestingModule } from '@nestjs/testing';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../branch/branch.entity';
import { BranchService } from '../../branch/branch.service';
import { MobileBranchService } from './mobile-branch.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1', 'branch-2'],
  roles: [],
};

/** Một chi nhánh như `BranchService` trả về — CỐ Ý mang cả field không được rò. */
function branch(overrides: Partial<BranchEntity> = {}): BranchEntity {
  return {
    id: 'branch-1',
    name: 'Chi nhánh Cà Mau',
    code: 'CM',
    isMainBranch: true,
    address: '123 Nguyễn Trãi',
    phone: '02838000000',
    email: 'camau@erp.local',
    status: 'ACTIVE',
    parentBranchId: null,
    organizationId: 'org-1',
    createdAt: new Date('2026-06-10T01:45:43.884Z'),
    ...overrides,
  } as unknown as BranchEntity;
}

/**
 * Service này chỉ làm hai việc: hỏi ĐÚNG nguồn, và nắn kết quả về hình dạng app
 * đọc. Cả hai kiểm được mà không cần Postgres.
 */
describe('MobileBranchService', () => {
  let service: MobileBranchService;
  let listMyBranches: jest.Mock;

  beforeEach(async () => {
    listMyBranches = jest.fn().mockResolvedValue([branch()]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileBranchService,
        {
          provide: BranchService,
          useValue: {
            listMyBranches,
            // Khai luôn `list` để phép kiểm "không gọi nhầm nguồn" bên dưới có
            // nghĩa — mock thiếu method thì `toHaveBeenCalled` không kiểm được gì.
            list: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(MobileBranchService);
  });

  it('hỏi danh sách của CHÍNH người dùng, không phải của tổ chức', async () => {
    await service.listMine(actor);

    // `BranchService.list` trả mọi chi nhánh của tổ chức. Dùng nhầm nó thì màn
    // bộ lọc bày ra những cửa hàng mà mọi request kế tiếp trả 403.
    expect(listMyBranches).toHaveBeenCalledWith(actor);
    expect(module_list_not_called(service)).toBe(true);
  });

  it('trả ĐÚNG sáu trường — email và mọi khoá nội bộ vẫn không rò', async () => {
    const [row] = await service.listMine(actor);

    expect(Object.keys(row).sort()).toEqual(['address', 'code', 'id', 'isMain', 'name', 'phone']);

    // `address`/`phone` mở 2026-09-14 cho PHIẾU THU — chúng là địa chỉ cửa hàng
    // in trên tờ phiếu đưa khách. `email` thì không có nơi dùng nào, nên nó ở
    // lại trong danh sách này và phép kiểm vẫn có nghĩa.
    const serialized = JSON.stringify(row);
    for (const leak of ['email', 'parentBranchId', 'organizationId', 'createdAt']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('đọc đúng giá trị, và đổi tên `isMainBranch` thành `isMain`', async () => {
    const [row] = await service.listMine(actor);

    expect(row).toEqual({
      id: 'branch-1',
      name: 'Chi nhánh Cà Mau',
      code: 'CM',
      isMain: true,
      address: '123 Nguyễn Trãi',
      phone: '02838000000',
    });
  });

  it('chi nhánh trống địa chỉ / điện thoại trả `null`, không phải `undefined`', async () => {
    listMyBranches.mockResolvedValue([branch({ address: undefined, phone: undefined })]);

    const [row] = await service.listMine(actor);

    // `undefined` biến mất khỏi JSON, nên app không phân biệt được "chi nhánh
    // không có địa chỉ" với "đường API chưa trả trường này".
    expect(row.address).toBeNull();
    expect(row.phone).toBeNull();
    expect(JSON.parse(JSON.stringify(row))).toHaveProperty('address', null);
  });

  it('chi nhánh KHÔNG có mã trả `null`, không phải chuỗi rỗng', async () => {
    listMyBranches.mockResolvedValue([branch({ code: null })]);

    const [row] = await service.listMine(actor);

    // `code` là cột nullable ở backend và dữ liệu thật đang có chi nhánh trống
    // mã; chuỗi rỗng đội lốt mã sẽ hiện ra một ô trống khó hiểu trên màn hình.
    expect(row.code).toBeNull();
  });

  it('không có chi nhánh nào thì trả danh sách rỗng, không ném', async () => {
    listMyBranches.mockResolvedValue([]);

    await expect(service.listMine(actor)).resolves.toEqual([]);
  });

  it('giữ nguyên THỨ TỰ của nguồn', async () => {
    listMyBranches.mockResolvedValue([
      branch({ id: 'b-1', name: 'Một' }),
      branch({ id: 'b-2', name: 'Hai' }),
      branch({ id: 'b-3', name: 'Ba' }),
    ]);

    const rows = await service.listMine(actor);

    // Nguồn sắp theo `createdAt ASC`; sắp lại ở đây là làm danh sách nhảy chỗ
    // giữa web và app cho cùng một người dùng.
    expect(rows.map((r) => r.id)).toEqual(['b-1', 'b-2', 'b-3']);
  });
});

/** Đọc lại mock `list` qua chính service — giữ phép kiểm ở trên đọc được. */
function module_list_not_called(service: MobileBranchService): boolean {
  const branches = (service as unknown as { branches: { list: jest.Mock } }).branches;

  return branches.list.mock.calls.length === 0;
}
