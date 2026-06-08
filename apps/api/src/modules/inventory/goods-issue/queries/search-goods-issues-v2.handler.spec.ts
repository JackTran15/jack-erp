import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GoodsIssueStatus } from '@erp/shared-interfaces';
import { StringOperator, CompareOperator } from '../../../../common/filters/filter.dto';
import { GoodsIssueEntity } from '../goods-issue.entity';
import { SearchGoodsIssuesV2Handler } from './search-goods-issues-v2.handler';
import { SearchGoodsIssuesV2Query } from './search-goods-issues-v2.query';
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

describe('SearchGoodsIssuesV2Handler', () => {
  let handler: SearchGoodsIssuesV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchGoodsIssuesV2Handler,
        { provide: getRepositoryToken(GoodsIssueEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchGoodsIssuesV2Handler);
  }

  it('scopes by org, hides CANCELLED, joins provider + targetBranch + lines', async () => {
    await build([]);
    await handler.execute(new SearchGoodsIssuesV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('gi.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('gi.status != :cancelled', {
      cancelled: GoodsIssueStatus.CANCELLED,
    });
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('gi.provider', 'provider');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('gi.targetBranch', 'targetBranch');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('gi.lines', 'lines');
    expect(qb.orderBy).toHaveBeenCalledWith('gi.createdAt', 'DESC');
  });

  it('returns the eager rows unchanged in the { data, total, page, limit } envelope', async () => {
    const rows = [
      {
        id: 'gi-1',
        documentNumber: 'PXK-1',
        provider: { id: 'pv-1', name: 'Acme' },
        targetBranch: null,
        lines: [{ quantity: '1', unitPrice: '5000' }],
      },
    ];
    await build(rows, 12);
    const result = await handler.execute(
      new SearchGoodsIssuesV2Query({ page: 2, limit: 10 }, actor),
    );
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result.data).toBe(rows);
    expect(result.total).toBe(12);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it('applies the party (COALESCE), notes and totalAmount filters', async () => {
    await build([]);
    await handler.execute(
      new SearchGoodsIssuesV2Query(
        {
          party: { operator: StringOperator.CONTAINS, value: 'Acme' },
          notes: { operator: StringOperator.CONTAINS, value: 'urgent' },
          totalAmount: { operator: CompareOperator.LTE, value: 1000000 },
        },
        actor,
      ),
    );

    const andWhereSql = qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('COALESCE(provider.name, targetBranch.name) ILIKE'),
        expect.stringContaining('gi.notes ILIKE'),
        expect.stringContaining('SUM(l.quantity * l.unit_price)'),
      ]),
    );
  });
});
