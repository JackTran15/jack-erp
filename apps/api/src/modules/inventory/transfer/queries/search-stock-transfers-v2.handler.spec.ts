import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransferStatus } from '@erp/shared-interfaces';
import { StringOperator } from '../../../../common/filters/filter.dto';
import { StockTransferEntity } from '../stock-transfer.entity';
import { SearchStockTransfersV2Handler } from './search-stock-transfers-v2.handler';
import { SearchStockTransfersV2Query } from './search-stock-transfers-v2.query';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeQb(entities: unknown[], raw: unknown[], total: number) {
  const qb: any = {
    leftJoin: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities, raw }),
    getCount: jest.fn().mockResolvedValue(total),
  };
  return qb;
}

describe('SearchStockTransfersV2Handler', () => {
  let handler: SearchStockTransfersV2Handler;
  let repo: any;
  let qb: ReturnType<typeof makeQb>;
  let lineFind: jest.Mock;

  async function build(
    entities: unknown[],
    raw: unknown[] = [],
    total = entities.length,
    lines: unknown[] = [],
  ) {
    qb = makeQb(entities, raw, total);
    lineFind = jest.fn().mockResolvedValue(lines);
    repo = {
      createQueryBuilder: jest.fn(() => qb),
      manager: { getRepository: jest.fn(() => ({ find: lineFind })) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchStockTransfersV2Handler,
        { provide: getRepositoryToken(StockTransferEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchStockTransfersV2Handler);
  }

  it('scopes by org and joins source + destination locations (no collection join)', async () => {
    await build([]);
    await handler.execute(new SearchStockTransfersV2Query({}, actor));

    // Cross-org isolation — every row is filtered by the actor's organization.
    expect(qb.where).toHaveBeenCalledWith('st.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'locations',
      'srcLoc',
      'srcLoc.id = st.sourceLocationId',
    );
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'locations',
      'dstLoc',
      'dstLoc.id = st.destinationLocationId',
    );
    expect(qb.orderBy).toHaveBeenCalledWith('st.createdAt', 'DESC');
  });

  it('attaches location names + separately-loaded lines and returns the envelope', async () => {
    const entities = [{ id: 'st-1', documentNumber: 'PCK-1', status: TransferStatus.DRAFT }];
    const raw = [
      { st_id: 'st-1', st_sourceLocationName: 'Kệ A', st_destinationLocationName: 'Kệ B' },
    ];
    const lines = [
      { transferId: 'st-1', quantity: '2' },
      { transferId: 'st-1', quantity: '3' },
    ];
    await build(entities, raw, 7, lines);
    const result = await handler.execute(
      new SearchStockTransfersV2Query({ page: 2, limit: 5 }, actor),
    );

    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(result.total).toBe(7);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(5);
    expect(result.data[0]).toMatchObject({
      id: 'st-1',
      sourceLocationName: 'Kệ A',
      destinationLocationName: 'Kệ B',
    });
    // lines came from the separate query, grouped by transferId.
    expect(result.data[0].lines).toHaveLength(2);
  });

  it('does not query lines when the page is empty', async () => {
    await build([]);
    await handler.execute(new SearchStockTransfersV2Query({}, actor));
    expect(lineFind).not.toHaveBeenCalled();
  });

  it('applies documentNumber, status, location-name and notes filters', async () => {
    await build([]);
    await handler.execute(
      new SearchStockTransfersV2Query(
        {
          documentNumber: { operator: StringOperator.CONTAINS, value: 'PCK' },
          status: { value: TransferStatus.POSTED },
          sourceLocation: { operator: StringOperator.CONTAINS, value: 'Kệ A' },
          destinationLocation: { operator: StringOperator.CONTAINS, value: 'Kệ B' },
          notes: { operator: StringOperator.CONTAINS, value: 'gấp' },
        },
        actor,
      ),
    );

    const andWhereSql = qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('st.documentNumber ILIKE'),
        expect.stringContaining('st.status ='),
        expect.stringContaining('srcLoc.name ILIKE'),
        expect.stringContaining('dstLoc.name ILIKE'),
        expect.stringContaining('st.notes ILIKE'),
      ]),
    );
  });
});
