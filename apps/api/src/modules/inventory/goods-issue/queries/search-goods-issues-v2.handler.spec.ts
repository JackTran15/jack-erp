import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DocCounterpartyKind, GoodsIssueStatus } from '@erp/shared-interfaces';
import { StringOperator, CompareOperator } from '../../../../common/filters/filter.dto';
import { CustomerEntity } from '../../../customer/customer.entity';
import { UserEntity } from '../../../auth/user.entity';
import { GoodsIssueEntity } from '../goods-issue.entity';
import { SearchGoodsIssuesV2Handler } from './search-goods-issues-v2.handler';
import { SearchGoodsIssuesV2Query } from './search-goods-issues-v2.query';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

/**
 * The handler builds the query up to three times per request — rows, totals,
 * and (only when rows is non-empty) a per-row Tổng tiền lookup — so the fake
 * repository hands out a fresh builder per `createQueryBuilder` call.
 * `builders[0]` is the rows query, `builders[1]` the totals query, `builders[2]`
 * (when present) the row-totals query.
 */
function makeQb(
  rows: unknown[],
  totals: { total: string; totalAmount: string },
  rowTotals: { id: string; totalAmount: string }[] = [],
) {
  const qb: any = {
    leftJoin: jest.fn(() => qb),
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue(rows),
    getRawOne: jest.fn().mockResolvedValue(totals),
    getRawMany: jest.fn().mockResolvedValue(rowTotals),
  };
  return qb;
}

describe('SearchGoodsIssuesV2Handler', () => {
  let handler: SearchGoodsIssuesV2Handler;
  let repo: { createQueryBuilder: jest.Mock; manager: { find: jest.Mock } };
  let builders: ReturnType<typeof makeQb>[];

  async function build(
    rows: unknown[],
    total = rows.length,
    totalAmount = '0',
    rowTotals: { id: string; totalAmount: string }[] = [],
  ) {
    builders = [];
    repo = {
      createQueryBuilder: jest.fn(() => {
        const next = makeQb(rows, { total: String(total), totalAmount }, rowTotals);
        builders.push(next);
        return next;
      }),
      manager: {
        find: jest.fn(async (entity: unknown) => {
          if (entity === CustomerEntity)
            return [{ id: 'cust-1', code: 'KH001', name: 'Khach A' }];
          if (entity === UserEntity)
            return [{ id: 'emp-1', firstName: 'Nguyen', lastName: 'Van A' }];
          return [];
        }),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchGoodsIssuesV2Handler,
        { provide: getRepositoryToken(GoodsIssueEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchGoodsIssuesV2Handler);
  }

  const qbOf = () => builders[0];
  const totalsQb = () => builders[1];
  const rowTotalsQb = () => builders[2];

  it('scopes by org and active branch, hides CANCELLED, joins relations, and never joins lines', async () => {
    await build([]);
    await handler.execute(new SearchGoodsIssuesV2Query({}, actor));

    expect(qbOf().where).toHaveBeenCalledWith('gi.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qbOf().andWhere).toHaveBeenCalledWith('gi.status != :cancelled', {
      cancelled: GoodsIssueStatus.CANCELLED,
    });
    expect(qbOf().andWhere).toHaveBeenCalledWith('gi.branchId = :branchId', {
      branchId: 'branch-1',
    });
    expect(qbOf().leftJoinAndSelect).toHaveBeenCalledWith('gi.provider', 'provider');
    expect(qbOf().leftJoin).toHaveBeenCalledWith('gi.targetBranch', 'targetBranch');
    expect(qbOf().addSelect).toHaveBeenCalledWith('targetBranch');
    expect(qbOf().leftJoinAndSelect).not.toHaveBeenCalledWith('gi.lines', 'lines');
    expect(qbOf().leftJoinAndSelect).not.toHaveBeenCalledWith('lines.item', 'lineItem');
    expect(qbOf().leftJoinAndSelect).not.toHaveBeenCalledWith('lines.location', 'lineLocation');
    expect(qbOf().orderBy).toHaveBeenCalledWith('gi.createdAt', 'DESC');
  });

  it('returns the eager rows unchanged in the { data, total, page, limit } envelope, without a lines field', async () => {
    const rows = [
      {
        id: 'gi-1',
        documentNumber: 'PXK-1',
        provider: { id: 'pv-1', name: 'Acme' },
        targetBranch: null,
      },
    ];
    await build(rows, 12, '0', [{ id: 'gi-1', totalAmount: '5000' }]);
    const result = await handler.execute(
      new SearchGoodsIssuesV2Query({ page: 2, limit: 10 }, actor),
    );
    expect(qbOf().skip).toHaveBeenCalledWith(10);
    expect(qbOf().take).toHaveBeenCalledWith(10);
    expect(result.data).toBe(rows);
    expect(result.data[0]).not.toHaveProperty('lines');
    expect(result.total).toBe(12);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it("attaches each row's own totalAmount (list money column no longer has `lines` to sum client-side)", async () => {
    const rows = [{ id: 'gi-1' }, { id: 'gi-2' }];
    await build(rows, 2, '0', [
      { id: 'gi-1', totalAmount: '300000' },
      { id: 'gi-2', totalAmount: '150000' },
    ]);
    const result = await handler.execute(new SearchGoodsIssuesV2Query({}, actor));

    expect(rowTotalsQb().where).toHaveBeenCalledWith('gi.id IN (:...ids)', {
      ids: ['gi-1', 'gi-2'],
    });
    expect(result.data[0]).toMatchObject({ id: 'gi-1', totalAmount: 300000 });
    expect(result.data[1]).toMatchObject({ id: 'gi-2', totalAmount: 150000 });
  });

  it('inlines resolved customer and employee names for the party column', async () => {
    const rows = [
      {
        id: 'gi-customer',
        counterpartyKind: DocCounterpartyKind.CUSTOMER,
        counterpartyId: 'cust-1',
        lines: [],
      },
      {
        id: 'gi-employee',
        counterpartyKind: DocCounterpartyKind.EMPLOYEE,
        counterpartyId: 'emp-1',
        lines: [],
      },
    ];
    await build(rows);

    const result = await handler.execute(new SearchGoodsIssuesV2Query({}, actor));

    expect(result.data[0].counterparty?.name).toBe('Khach A');
    expect(result.data[1].counterparty?.name).toBe('Nguyen Van A');
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

    const andWhereSql = qbOf().andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        // Party = counterparty name (3 kinds) COALESCE'd with the target branch.
        expect.stringContaining('gi.counterparty_kind'),
        expect.stringContaining('targetBranch.name'),
        expect.stringContaining('gi.notes ILIKE'),
        expect.stringContaining('SUM(l.quantity * l.unit_price)'),
      ]),
    );
  });
});

describe('SearchGoodsIssuesV2Handler — footer grand total', () => {
  function setup(totals: { total: string; totalAmount: string }) {
    const builders: any[] = [];
    const repo = {
      createQueryBuilder: jest.fn(() => {
        const qb = makeQb([], totals);
        builders.push(qb);
        return qb;
      }),
      manager: { find: jest.fn().mockResolvedValue([]) },
    };
    return { builders, repo };
  }

  async function handlerWith(repo: unknown) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchGoodsIssuesV2Handler,
        { provide: getRepositoryToken(GoodsIssueEntity), useValue: repo },
      ],
    }).compile();
    return module.get(SearchGoodsIssuesV2Handler);
  }

  it('reads totalAmount from a second query over the whole filtered set', async () => {
    const { builders, repo } = setup({ total: '31', totalAmount: '9250000' });
    const handler = await handlerWith(repo);

    const result = await handler.execute(new SearchGoodsIssuesV2Query({}, actor));

    expect(result.totals.totalAmount).toBe(9250000);
    expect(result.total).toBe(31);
    expect(builders[1].select).toHaveBeenCalledWith('COUNT(*)', 'total');
    expect(builders[1].addSelect).toHaveBeenCalledWith(
      expect.stringContaining('SUM(l.quantity * l.unit_price)'),
      'totalAmount',
    );
  });

  it('never joins lines in the totals query — a multi-line issue must count once', async () => {
    const { builders, repo } = setup({ total: '1', totalAmount: '5000' });
    const handler = await handlerWith(repo);

    await handler.execute(new SearchGoodsIssuesV2Query({}, actor));

    // Joining a one-to-many `lines` here would multiply each issue by its line
    // count and inflate the SUM behind the footer.
    expect(builders[1].leftJoinAndSelect).not.toHaveBeenCalled();
  });

  it('keeps CANCELLED documents out of the grand total', async () => {
    const { builders, repo } = setup({ total: '0', totalAmount: '0' });
    const handler = await handlerWith(repo);

    await handler.execute(new SearchGoodsIssuesV2Query({}, actor));

    expect(builders[1].andWhere).toHaveBeenCalledWith('gi.status != :cancelled', {
      cancelled: GoodsIssueStatus.CANCELLED,
    });
  });

  it('is invariant to limit: page size never changes the grand total', async () => {
    const { repo } = setup({ total: '31', totalAmount: '9250000' });
    const handler = await handlerWith(repo);

    const small = await handler.execute(new SearchGoodsIssuesV2Query({ limit: 1 }, actor));
    const large = await handler.execute(new SearchGoodsIssuesV2Query({ limit: 100 }, actor));

    expect(small.totals.totalAmount).toBe(large.totals.totalAmount);
    expect(small.total).toBe(large.total);
  });
});
