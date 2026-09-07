import { Test, TestingModule } from '@nestjs/testing';
import { QueryBus } from '@nestjs/cqrs';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CounterpartyKind } from '../../counterparty/dto/search-counterparties.dto';
import { MobileCounterpartyService } from './mobile-counterparty.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1'],
  roles: [],
};

describe('MobileCounterpartyService', () => {
  let service: MobileCounterpartyService;
  let execute: jest.Mock;

  beforeEach(async () => {
    execute = jest.fn().mockResolvedValue({
      data: [
        {
          kind: 'supplier',
          id: 'p-1',
          code: 'NCC-BITIS',
          name: 'Công ty Biti’s',
          phone: '02838000000',
          address: '123 Nguyễn Trãi',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileCounterpartyService,
        { provide: QueryBus, useValue: { execute } },
      ],
    }).compile();

    service = module.get(MobileCounterpartyService);
  });

  const run = (query: object = {}) =>
    service.list({ page: 1, limit: 20, ...query }, actor);

  const sentDto = () => execute.mock.calls[0][0].dto;

  it('KHÔNG truyền `kinds` thì hỏi đúng hai loại phiếu kho nhận được', async () => {
    await run();

    // `all` sẽ kéo theo KHÁCH HÀNG, mà `resolveDocCounterparty` từ chối loại
    // đó — danh sách sẽ bày ra thứ chọn xong là 400.
    expect(sentDto().types).toEqual([
      CounterpartyKind.SUPPLIER,
      CounterpartyKind.EMPLOYEE,
    ]);
  });

  it('truyền `kinds` thì thu hẹp đúng loại đó', async () => {
    await run({ kinds: [CounterpartyKind.EMPLOYEE] });

    expect(sentDto().types).toEqual([CounterpartyKind.EMPLOYEE]);
  });

  it('trả ĐÚNG bốn trường — không rò điện thoại, địa chỉ', async () => {
    const { data } = await run();

    expect(Object.keys(data[0]).sort()).toEqual(['code', 'id', 'kind', 'name']);

    const serialized = JSON.stringify(data[0]);
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('address');
  });

  it('`kind` PHẢI đi ra — payload lúc lưu cần nó', async () => {
    const { data } = await run();

    // Backend route nhà cung cấp và nhân viên đi hai đường khác nhau; app
    // không suy được loại từ một mình `id`.
    expect(data[0].kind).toBe('supplier');
  });

  it('đối tượng không có mã trả `null`, không phải chuỗi rỗng', async () => {
    execute.mockResolvedValue({
      data: [{ kind: 'employee', id: 'u-1', code: null, name: 'Inventory Admin' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const { data } = await run();

    expect(data[0].code).toBeNull();
  });

  it('đổi `pageSize` của nguồn thành `limit` — quy ước của mọi đường /mobile', async () => {
    const page = await run({ limit: 50 });

    expect(sentDto().pageSize).toBe(50);
    expect(page.limit).toBe(20); // theo đúng thứ nguồn trả về
    expect(page).not.toHaveProperty('pageSize');
  });

  it('chuyển tiếp `search` xuống nguồn', async () => {
    await run({ search: 'biti' });

    expect(sentDto().search).toBe('biti');
  });
});
