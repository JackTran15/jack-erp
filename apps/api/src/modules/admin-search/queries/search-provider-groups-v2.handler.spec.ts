import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StringOperator } from '../../../common/filters/filter.dto';
import { SupplierGroupEntity } from '../../inventory/location/supplier-group.entity';
import { SearchProviderGroupsV2Handler } from './search-provider-groups-v2.handler';
import { SearchProviderGroupsV2Query } from './search-provider-groups-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeMatchingQb(result: [SupplierGroupEntity[], number]) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

function makeAllRowsQb(rows: SupplierGroupEntity[]) {
  const qb: any = {
    where: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

describe('SearchProviderGroupsV2Handler', () => {
  let handler: SearchProviderGroupsV2Handler;
  let matchingQb: ReturnType<typeof makeMatchingQb>;
  let allRowsQb: ReturnType<typeof makeAllRowsQb>;

  async function build(
    matches: SupplierGroupEntity[],
    allRows: SupplierGroupEntity[],
    total = matches.length,
  ) {
    matchingQb = makeMatchingQb([matches, total]);
    allRowsQb = makeAllRowsQb(allRows);
    const createQueryBuilder = jest
      .fn()
      .mockReturnValueOnce(matchingQb)
      .mockReturnValueOnce(allRowsQb);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchProviderGroupsV2Handler,
        {
          provide: getRepositoryToken(SupplierGroupEntity),
          useValue: { createQueryBuilder },
        },
      ],
    }).compile();
    handler = module.get(SearchProviderGroupsV2Handler);
  }

  it('applies all filters to an organization-scoped matching query', async () => {
    await build([], []);
    await handler.execute(
      new SearchProviderGroupsV2Query(
        {
          code: { operator: StringOperator.STARTS_WITH, value: 'NCC' },
          name: { operator: StringOperator.CONTAINS, value: 'Thiết bị' },
          description: { operator: StringOperator.EQUALS, value: 'Miền Bắc' },
          isActive: false,
        },
        actor,
      ),
    );

    expect(matchingQb.where).toHaveBeenCalledWith(
      'providerGroup.organizationId = :orgId',
      { orgId: 'org-1' },
    );
    const sql = matchingQb.andWhere.mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(sql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('providerGroup.code ILIKE'),
        expect.stringContaining('providerGroup.name ILIKE'),
        expect.stringContaining('providerGroup.description ='),
      ]),
    );
    expect(matchingQb.andWhere).toHaveBeenCalledWith(
      'providerGroup.isActive = :isActive',
      { isActive: false },
    );
  });

  it('returns matches with every ancestor while total excludes ancestors', async () => {
    const root = { id: 'root', parentGroupId: undefined } as SupplierGroupEntity;
    const parent = { id: 'parent', parentGroupId: 'root' } as SupplierGroupEntity;
    const match = { id: 'match', parentGroupId: 'parent' } as SupplierGroupEntity;
    const unrelated = {
      id: 'unrelated',
      parentGroupId: undefined,
    } as SupplierGroupEntity;
    await build([match], [match, parent, root, unrelated], 1);

    const result = await handler.execute(
      new SearchProviderGroupsV2Query({}, actor),
    );

    expect(allRowsQb.where).toHaveBeenCalledWith(
      'providerGroup.organizationId = :orgId',
      { orgId: 'org-1' },
    );
    expect(allRowsQb.orderBy).toHaveBeenCalledWith(
      'providerGroup.createdAt',
      'DESC',
    );
    expect(result).toEqual({
      data: [match, parent, root],
      total: 1,
      page: 1,
      limit: 3,
    });
  });
});
