import { QueryBus } from '@nestjs/cqrs';
import { CashVoucherSearchController } from './cash-voucher-search.controller';
import { SearchCashVouchersQuery } from './search-cash-vouchers.query';

describe('CashVoucherSearchController', () => {
  it('delegates POST search to QueryBus with dto and actor', async () => {
    const queryBus = { execute: jest.fn().mockResolvedValue({ data: [] }) };
    const controller = new CashVoucherSearchController(
      queryBus as unknown as QueryBus,
    );
    const dto = { page: 2, limit: 10 };
    const actor = {
      userId: 'admin-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      roles: [],
    };

    await controller.search(dto, actor);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(SearchCashVouchersQuery),
    );
    expect(queryBus.execute.mock.calls[0][0]).toMatchObject({ dto, actor });
  });
});
