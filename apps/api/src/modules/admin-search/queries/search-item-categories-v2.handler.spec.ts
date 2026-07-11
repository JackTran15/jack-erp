import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StringOperator } from '../../../common/filters/filter.dto';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { SearchItemCategoriesV2Handler } from './search-item-categories-v2.handler';
import { SearchItemCategoriesV2Query } from './search-item-categories-v2.query';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeQb(result: [unknown[], number]) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('SearchItemCategoriesV2Handler', () => {
  let handler: SearchItemCategoriesV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchItemCategoriesV2Handler,
        { provide: getRepositoryToken(ItemCategoryEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchItemCategoriesV2Handler);
  }

  it('scopes by organizationId and orders by code ASC', async () => {
    await build([]);
    await handler.execute(new SearchItemCategoriesV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('category.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.orderBy).toHaveBeenCalledWith('category.code', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('category.name', 'ASC');
  });

  it('applies code and name string filters', async () => {
    await build([]);
    await handler.execute(
      new SearchItemCategoriesV2Query(
        {
          code: { operator: StringOperator.CONTAINS, value: 'NHK' },
          name: { operator: StringOperator.EQUALS, value: 'Đồ uống' },
        },
        actor,
      ),
    );

    const andWhereSql = qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('category.code ILIKE'),
        expect.stringContaining('category.name ='),
      ]),
    );
  });

  it('returns the full entity rows and the { data, total, page, limit } envelope', async () => {
    const rows = [{ id: 'c-1', code: 'NHK001', name: 'Đồ uống', createdAt: new Date() }];
    await build(rows, 9);
    const result = await handler.execute(
      new SearchItemCategoriesV2Query({ page: 2, limit: 4 }, actor),
    );
    expect(qb.skip).toHaveBeenCalledWith(4);
    expect(qb.take).toHaveBeenCalledWith(4);
    expect(result.data).toBe(rows);
    expect(result.total).toBe(9);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(4);
  });
});
