import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StringOperator } from '../../../common/filters/filter.dto';
import { RoleEntity } from '../../auth/role.entity';
import { SearchRolesV2Handler } from './search-roles-v2.handler';
import { SearchRolesV2Query } from './search-roles-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeQb(result: [RoleEntity[], number]) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('SearchRolesV2Handler', () => {
  let handler: SearchRolesV2Handler;
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: RoleEntity[], total = rows.length) {
    qb = makeQb([rows, total]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchRolesV2Handler,
        {
          provide: getRepositoryToken(RoleEntity),
          useValue: { createQueryBuilder: jest.fn(() => qb) },
        },
      ],
    }).compile();
    handler = module.get(SearchRolesV2Handler);
  }

  it('scopes by organization and preserves the createdAt ASC default sort', async () => {
    await build([]);
    await handler.execute(new SearchRolesV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('role.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.orderBy).toHaveBeenCalledWith('role.createdAt', 'ASC');
  });

  it('applies name and description filters', async () => {
    await build([]);
    await handler.execute(
      new SearchRolesV2Query(
        {
          name: { operator: StringOperator.CONTAINS, value: 'Quản lý' },
          description: {
            operator: StringOperator.NOT_CONTAINS,
            value: 'hệ thống',
          },
        },
        actor,
      ),
    );

    const sql = qb.andWhere.mock.calls.map((call: unknown[]) => call[0]);
    expect(sql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('role.name ILIKE'),
        expect.stringContaining('role.description NOT ILIKE'),
      ]),
    );
  });

  it('preserves the RoleSummary shape and returns the paged envelope', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    const updatedAt = new Date('2026-02-03T04:05:06.000Z');
    const rows = [
      {
        id: 'role-1',
        organizationId: 'org-1',
        name: 'Quản lý',
        description: null,
        isSystem: false,
        createdAt,
        updatedAt,
      } as RoleEntity,
    ];
    await build(rows, 3);

    const result = await handler.execute(
      new SearchRolesV2Query({ page: 2, limit: 1 }, actor),
    );

    expect(result).toEqual({
      data: [
        {
          id: 'role-1',
          name: 'Quản lý',
          description: null,
          isSystem: false,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
      ],
      total: 3,
      page: 2,
      limit: 1,
    });
  });
});
