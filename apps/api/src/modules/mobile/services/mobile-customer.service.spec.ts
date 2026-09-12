import { Test, TestingModule } from '@nestjs/testing';
import { QueryBus } from '@nestjs/cqrs';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CounterpartyKind } from '../../counterparty/dto/search-counterparties.dto';
import { MobileCustomerService } from './mobile-customer.service';

const actor: ActorContext = {
  userId: 'seller-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1'],
  roles: [],
};

describe('MobileCustomerService', () => {
  let service: MobileCustomerService;
  let execute: jest.Mock;

  beforeEach(async () => {
    execute = jest.fn().mockResolvedValue({
      data: [
        {
          kind: 'customer',
          id: 'c-1',
          code: 'KH0001',
          name: 'Trần Thị Bình',
          phone: '0903000111',
          // Nguồn CÓ `address`, và nó phải KHÔNG đi ra — xem test cuối.
          address: '12 Lê Lợi, Long Xuyên',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileCustomerService,
        { provide: QueryBus, useValue: { execute } },
      ],
    }).compile();

    service = module.get(MobileCustomerService);
  });

  const run = (query: object = {}) =>
    service.list({ page: 1, limit: 20, ...query }, actor);

  const sentDto = () => execute.mock.calls[0][0].dto;

  it('hỏi ĐÚNG loại khách hàng — không kéo theo nhà cung cấp hay nhân viên', async () => {
    await run();

    // Hai vế, và vế thứ hai là vế dễ mất: `type: ALL` chính là cách hợp đồng
    // bên dưới nói *"đọc `types[]`"*. Bỏ nó thì `types` bị lờ đi và danh sách
    // chọn khách có cả nhà cung cấp.
    expect(sentDto().types).toEqual([CounterpartyKind.CUSTOMER]);
    expect(sentDto().type).toBe(CounterpartyKind.ALL);
  });

  it('chuyển tiếp actor — truy vấn tự lọc theo tổ chức', async () => {
    await run();

    expect(execute.mock.calls[0][0].actor).toBe(actor);
  });

  it('`search` và phân trang đi thẳng xuống, không đổi tên tham số', async () => {
    await run({ page: 3, limit: 50, search: 'Bình' });

    expect(sentDto().search).toBe('Bình');
    expect(sentDto().page).toBe(3);
    // `limit` của app thành `pageSize` của truy vấn — đúng một chỗ đổi tên, và
    // đây là chỗ khoá nó lại.
    expect(sentDto().pageSize).toBe(50);
  });

  it('trả ĐÚNG bốn trường: `phone` CÓ, `address` và `kind` thì KHÔNG', async () => {
    const page = await run();

    // `phone` là khoá tra cứu của màn chọn khách — khác hẳn
    // `MobileCounterpartyResponseDto`, nơi nó cố ý bị bỏ.
    expect(page.data[0]).toEqual({
      id: 'c-1',
      code: 'KH0001',
      name: 'Trần Thị Bình',
      phone: '0903000111',
    });
    // Khẳng định PHỦ ĐỊNH tường minh: một `...row` vô tình sẽ làm test trên đỏ,
    // nhưng dòng này nói ra Ý ĐỊNH — địa chỉ khách hàng không rời máy chủ.
    expect(Object.keys(page.data[0]).sort()).toEqual(['code', 'id', 'name', 'phone']);
  });

  it('`code` và `phone` NULL vẫn đi ra được — khách vãng lai', async () => {
    execute.mockResolvedValueOnce({
      data: [{ kind: 'customer', id: 'c-2', name: 'Khách lẻ' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const page = await run();

    // `undefined` của nguồn phải thành `null`, không phải mất hẳn khoá: client
    // đọc JSON, và một khoá vắng mặt với một khoá `null` là hai ca khác nhau ở
    // tầng parse.
    expect(page.data[0].code).toBeNull();
    expect(page.data[0].phone).toBeNull();
  });

  it('phân trang của nguồn đi ra nguyên vẹn', async () => {
    const page = await run();

    expect({ total: page.total, page: page.page, limit: page.limit }).toEqual({
      total: 1,
      page: 1,
      limit: 20,
    });
  });
});
