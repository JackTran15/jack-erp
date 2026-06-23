import {
  GUARDS_METADATA,
  PATH_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import { QueryBus } from '@nestjs/cqrs';
import { PermissionGuard } from '../../../../rbac/permission.guard';
import { CashCountV2Controller } from './cash-count-v2.controller';
import { SearchCashCountsV2Query } from '../queries/search-cash-counts-v2.query';

describe('CashCountV2Controller', () => {
  it('dispatches search through QueryBus and uses the permission guard', async () => {
    const queryBus = { execute: jest.fn().mockResolvedValue({ data: [] }) };
    const controller = new CashCountV2Controller(queryBus as unknown as QueryBus);
    const dto = { page: 1, limit: 20 };
    const actor = {
      userId: 'user-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      roles: [],
    };

    await controller.search(dto, actor);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(SearchCashCountsV2Query),
    );
    expect(queryBus.execute.mock.calls[0][0]).toMatchObject({ dto, actor });
    expect(Reflect.getMetadata(GUARDS_METADATA, CashCountV2Controller)).toContain(
      PermissionGuard,
    );
    expect(Reflect.getMetadata(PATH_METADATA, CashCountV2Controller)).toBe(
      'cash-counts',
    );
    expect(
      Reflect.getMetadata(VERSION_METADATA, CashCountV2Controller.prototype.search),
    ).toBe('2');
    expect(
      Reflect.getMetadata(PATH_METADATA, CashCountV2Controller.prototype.search),
    ).toBe('search');
  });
});
