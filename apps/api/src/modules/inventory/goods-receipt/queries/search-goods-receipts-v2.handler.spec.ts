import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StringOperator, CompareOperator } from '../../../../common/filters/filter.dto';
import { GoodsReceiptEntity } from '../goods-receipt.entity';
import { SearchGoodsReceiptsV2Handler } from './search-goods-receipts-v2.handler';
import { SearchGoodsReceiptsV2Query } from './search-goods-receipts-v2.query';
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
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('SearchGoodsReceiptsV2Handler', () => {
  let handler: SearchGoodsReceiptsV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchGoodsReceiptsV2Handler,
        { provide: getRepositoryToken(GoodsReceiptEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchGoodsReceiptsV2Handler);
  }

  it('scopes by organizationId and joins provider + lines (full row shape)', async () => {
    await build([]);
    await handler.execute(new SearchGoodsReceiptsV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('gr.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('gr.provider', 'provider');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('gr.lines', 'lines');
    expect(qb.orderBy).toHaveBeenCalledWith('gr.receivedAt', 'DESC');
  });

  it('returns the eager rows unchanged in the { data, total, page, limit } envelope', async () => {
    const rows = [
      {
        id: 'gr-1',
        documentNumber: 'PNK-1',
        provider: { id: 'pv-1', name: 'Acme' },
        lines: [{ quantity: '2', unitPrice: '1000' }],
      },
    ];
    await build(rows, 7);
    const result = await handler.execute(
      new SearchGoodsReceiptsV2Query({ page: 3, limit: 5 }, actor),
    );
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(result.data).toBe(rows);
    expect(result.total).toBe(7);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(5);
  });

  it('applies documentNumber, party and totalAmount filters', async () => {
    await build([]);
    await handler.execute(
      new SearchGoodsReceiptsV2Query(
        {
          documentNumber: { operator: StringOperator.CONTAINS, value: 'PNK' },
          party: { operator: StringOperator.CONTAINS, value: 'Acme' },
          totalAmount: { operator: CompareOperator.LTE, value: 2000000 },
        },
        actor,
      ),
    );

    const andWhereSql = qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('gr.documentNumber ILIKE'),
        expect.stringContaining('provider.name ILIKE'),
        expect.stringContaining('SUM(l.quantity * l.unit_price)'),
      ]),
    );
  });
});
