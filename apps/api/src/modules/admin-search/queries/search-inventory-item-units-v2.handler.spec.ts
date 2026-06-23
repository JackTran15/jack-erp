import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StringOperator } from '../../../common/filters/filter.dto';
import { UnitOfMeasureEntity } from '../../inventory/location/unit-of-measure.entity';
import { SearchInventoryItemUnitsV2Handler } from './search-inventory-item-units-v2.handler';
import { SearchInventoryItemUnitsV2Query } from './search-inventory-item-units-v2.query';

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
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('SearchInventoryItemUnitsV2Handler', () => {
  let handler: SearchInventoryItemUnitsV2Handler;
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchInventoryItemUnitsV2Handler,
        {
          provide: getRepositoryToken(UnitOfMeasureEntity),
          useValue: { createQueryBuilder: jest.fn(() => qb) },
        },
      ],
    }).compile();
    handler = module.get(SearchInventoryItemUnitsV2Handler);
  }

  it('scopes by organization and preserves the createdAt DESC default sort', async () => {
    await build([]);
    await handler.execute(new SearchInventoryItemUnitsV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('unit.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.orderBy).toHaveBeenCalledWith('unit.createdAt', 'DESC');
  });

  it('applies name, description, and isActive filters', async () => {
    await build([]);
    await handler.execute(
      new SearchInventoryItemUnitsV2Query(
        {
          name: { operator: StringOperator.CONTAINS, value: 'Hộp' },
          description: { operator: StringOperator.EQUALS, value: 'Đóng gói' },
          isActive: false,
        },
        actor,
      ),
    );

    const sql = qb.andWhere.mock.calls.map((call: unknown[]) => call[0]);
    expect(sql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unit.name ILIKE'),
        expect.stringContaining('unit.description ='),
      ]),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('unit.isActive = :isActive', {
      isActive: false,
    });
  });

  it('returns the paged search envelope', async () => {
    const rows = [{ id: 'unit-1', name: 'Hộp' }];
    await build(rows, 7);

    const result = await handler.execute(
      new SearchInventoryItemUnitsV2Query({ page: 2, limit: 3 }, actor),
    );

    expect(qb.skip).toHaveBeenCalledWith(3);
    expect(qb.take).toHaveBeenCalledWith(3);
    expect(result).toEqual({ data: rows, total: 7, page: 2, limit: 3 });
  });
});
