import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StockTakeStatus } from '@erp/shared-interfaces';
import { StringOperator } from '../../../../common/filters/filter.dto';
import { StockTakeEntity } from '../stock-take.entity';
import { SearchStockTakesV2Handler } from './search-stock-takes-v2.handler';
import { SearchStockTakesV2Query } from './search-stock-takes-v2.query';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeQb(result: [unknown[], number]) {
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
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

describe('SearchStockTakesV2Handler', () => {
  let handler: SearchStockTakesV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchStockTakesV2Handler,
        { provide: getRepositoryToken(StockTakeEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchStockTakesV2Handler);
  }

  it('scopes by org, joins lines + storage', async () => {
    await build([]);
    await handler.execute(new SearchStockTakesV2Query({}, actor));

    // Cross-org isolation: the WHERE is bound to the actor's organizationId.
    expect(qb.where).toHaveBeenCalledWith('st.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('st.lines', 'lines');
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'storages',
      'storage',
      'storage.id = st.storage_id AND storage.organization_id = st.organization_id',
    );
    expect(qb.orderBy).toHaveBeenCalledWith('st.createdAt', 'DESC');
  });

  it('returns the eager rows unchanged in the { data, total, page, limit } envelope', async () => {
    const rows = [
      {
        id: 'st-1',
        documentNumber: 'KK000001',
        status: StockTakeStatus.DRAFT,
        lines: [{ id: 'l-1' }],
      },
    ];
    await build(rows, 7);
    const result = await handler.execute(
      new SearchStockTakesV2Query({ page: 2, limit: 10 }, actor),
    );
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result.data).toBe(rows);
    expect(result.total).toBe(7);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it('applies the documentNumber, storage name and status filters', async () => {
    await build([]);
    await handler.execute(
      new SearchStockTakesV2Query(
        {
          documentNumber: { operator: StringOperator.CONTAINS, value: 'KK00' },
          storage: { operator: StringOperator.CONTAINS, value: 'Kho A' },
          status: { value: StockTakeStatus.POSTED },
        },
        actor,
      ),
    );

    const andWhereSql = qb.andWhere.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('st.documentNumber ILIKE'),
        expect.stringContaining('storage.name ILIKE'),
        expect.stringContaining('st.status ='),
      ]),
    );
  });

  it('applies the createdAt date range as inclusive from/to', async () => {
    await build([]);
    await handler.execute(
      new SearchStockTakesV2Query(
        { date: { from: '2026-01-01', to: '2026-01-31' } },
        actor,
      ),
    );

    const andWhereSql = qb.andWhere.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('st.createdAt >='),
        expect.stringContaining('st.createdAt <'),
      ]),
    );
  });
});
