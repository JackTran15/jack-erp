import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserEntity } from '../../auth/user.entity';
import { UsersService } from '../../rbac/users.service';
import { SearchEmployeesV2Handler } from './search-employees-v2.handler';
import { SearchEmployeesV2Query } from './search-employees-v2.query';
import { StringOperator } from '../../../common/filters/filter.dto';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeQb(result: [unknown[], number]) {
  const qb: any = {
    leftJoin: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('SearchEmployeesV2Handler', () => {
  let handler: SearchEmployeesV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let users: { toListItems: jest.Mock; visibleUserIds: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  const userRow = { id: 'u-1' };
  const mappedItem = {
    id: 'u-1',
    code: 'NV000001',
    profile: { code: 'NV000001', jobPosition: { id: 'jp-1', name: 'Sales' } },
  };

  beforeEach(async () => {
    qb = makeQb([[userRow], 1]);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    users = {
      toListItems: jest.fn().mockResolvedValue([mappedItem]),
      // null = actor holds iam.user.read.all, i.e. no branch restriction.
      visibleUserIds: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchEmployeesV2Handler,
        { provide: getRepositoryToken(UserEntity), useValue: repo },
        { provide: UsersService, useValue: users },
      ],
    }).compile();
    handler = module.get(SearchEmployeesV2Handler);
  });

  it('scopes by organizationId, joins the profile, and delegates row mapping to UsersService.toListItems', async () => {
    const result = await handler.execute(
      new SearchEmployeesV2Query({}, actor),
    );

    expect(qb.leftJoin).toHaveBeenCalledWith(
      expect.anything(),
      'profile',
      'profile.user_id = u.id AND profile.organization_id::uuid = u.organization_id',
    );
    expect(qb.where).toHaveBeenCalledWith('u.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(users.toListItems).toHaveBeenCalledWith([userRow], actor);
    expect(result).toEqual({
      data: [mappedItem],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  /**
   * This surface returns the same rows as GET /admin/users, so it has to honour
   * the same branch scope — otherwise it is a way around it.
   */
  describe('branch scoping', () => {
    it('restricts to the ids the actor may see', async () => {
      users.visibleUserIds.mockResolvedValue(['u-1', 'u-2']);

      await handler.execute(new SearchEmployeesV2Query({}, actor));

      expect(qb.andWhere).toHaveBeenCalledWith('u.id IN (:...visibleIds)', {
        visibleIds: ['u-1', 'u-2'],
      });
    });

    it('returns nothing, and never queries, when the scope is empty', async () => {
      users.visibleUserIds.mockResolvedValue([]);

      const result = await handler.execute(
        new SearchEmployeesV2Query({}, actor),
      );

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      expect(qb.getManyAndCount).not.toHaveBeenCalled();
    });
  });

  it('filters fullName over the CONCAT(firstName, lastName) expression', async () => {
    await handler.execute(
      new SearchEmployeesV2Query(
        { fullName: { operator: StringOperator.CONTAINS, value: 'Nguyen' } },
        actor,
      ),
    );
    const matched = qb.andWhere.mock.calls.some(
      (c: [string, Record<string, unknown>]) =>
        c[0].includes("CONCAT(u.first_name, ' ', u.last_name) ILIKE") &&
        Object.values(c[1])[0] === '%Nguyen%',
    );
    expect(matched).toBe(true);
  });

  it('applies isActive and jobPositionId filters', async () => {
    await handler.execute(
      new SearchEmployeesV2Query(
        { isActive: true, jobPositionId: 'jp-9' },
        actor,
      ),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('u.isActive = :isActive', {
      isActive: true,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'profile.jobPositionId = :jobPositionId',
      { jobPositionId: 'jp-9' },
    );
  });
});
