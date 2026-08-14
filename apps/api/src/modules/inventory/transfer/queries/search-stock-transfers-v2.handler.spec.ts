import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransferStatus } from '@erp/shared-interfaces';
import {
  StringOperator,
  CompareOperator,
} from '../../../../common/filters/filter.dto';
import { StockTransferEntity } from '../stock-transfer.entity';
import { UserEntity } from '../../../auth/user.entity';
import { SearchStockTransfersV2Handler } from './search-stock-transfers-v2.handler';
import { SearchStockTransfersV2Query } from './search-stock-transfers-v2.query';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

/**
 * The handler builds the query twice — once for rows, once for totals — so the
 * fake repository hands out a fresh builder per `createQueryBuilder` call.
 * `builders[0]` is the rows query, `builders[1]` the totals query.
 */
function makeQb(rows: unknown[], totals: { total: string; totalAmount: string }) {
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
  };
  return qb;
}

describe('SearchStockTransfersV2Handler', () => {
  let handler: SearchStockTransfersV2Handler;
  let repo: { createQueryBuilder: jest.Mock; manager: unknown };
  let userRepo: { find: jest.Mock };
  let builders: ReturnType<typeof makeQb>[];

  async function build(
    rows: unknown[],
    total = rows.length,
    users: unknown[] = [],
    totalAmount = '0',
  ) {
    builders = [];
    repo = {
      createQueryBuilder: jest.fn(() => {
        const next = makeQb(rows, { total: String(total), totalAmount });
        builders.push(next);
        return next;
      }),
      manager: {},
    };
    userRepo = { find: jest.fn().mockResolvedValue(users) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchStockTransfersV2Handler,
        { provide: getRepositoryToken(StockTransferEntity), useValue: repo },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
      ],
    }).compile();
    handler = module.get(SearchStockTransfersV2Handler);
  }

  const qbOf = () => builders[0];
  const totalsQb = () => builders[1];

  it('scopes by org + branch, hides CANCELLED, joins lines, orders by createdAt', async () => {
    await build([]);
    await handler.execute(new SearchStockTransfersV2Query({}, actor));

    expect(qbOf().where).toHaveBeenCalledWith('st.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qbOf().andWhere).toHaveBeenCalledWith('st.status != :cancelled', {
      cancelled: TransferStatus.CANCELLED,
    });
    expect(qbOf().andWhere).toHaveBeenCalledWith('st.branchId = :branchId', {
      branchId: 'branch-1',
    });
    expect(qbOf().leftJoinAndSelect).toHaveBeenCalledWith('st.lines', 'lines');
    expect(qbOf().orderBy).toHaveBeenCalledWith('st.createdAt', 'DESC');
  });

  it('omits the branch filter when the actor has no active branch', async () => {
    await build([]);
    await handler.execute(
      new SearchStockTransfersV2Query({}, { ...actor, branchId: undefined }),
    );
    const andWhereCalls = qbOf().andWhere.mock.calls.map((c: unknown[]) => c[0]);
    expect(andWhereCalls).not.toContain('st.branchId = :branchId');
  });

  it('paginates and inlines transporter + totalAmount per row', async () => {
    const rows = [
      {
        id: 'st-1',
        documentNumber: 'CK000001',
        transporterUserId: 'u-1',
        lines: [{ lineValue: '356000' }, { lineValue: '285000' }],
      },
    ];
    await build(rows, 12, [
      { id: 'u-1', firstName: 'Phan', lastName: 'Thanh Hà', organizationId: 'org-1' },
    ]);

    const result = await handler.execute(
      new SearchStockTransfersV2Query({ page: 2, limit: 10 }, actor),
    );

    expect(qbOf().skip).toHaveBeenCalledWith(10);
    expect(qbOf().take).toHaveBeenCalledWith(10);
    expect(result.total).toBe(12);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.data[0].transporter).toEqual({
      id: 'u-1',
      fullName: 'Phan Thanh Hà',
    });
    expect(result.data[0].totalAmount).toBe(641000);
  });

  it('applies documentNumber, party (transporter), notes, date and totalAmount filters', async () => {
    await build([]);
    await handler.execute(
      new SearchStockTransfersV2Query(
        {
          documentNumber: { operator: StringOperator.CONTAINS, value: 'CK' },
          party: { operator: StringOperator.CONTAINS, value: 'Hà' },
          notes: { operator: StringOperator.CONTAINS, value: 'akenzy' },
          date: { operator: CompareOperator.LTE, value: '2026-06-09' },
          totalAmount: { operator: CompareOperator.LTE, value: 1000000 },
        },
        actor,
      ),
    );

    const andWhereSql = qbOf().andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('st.documentNumber ILIKE'),
        expect.stringContaining('u.first_name'),
        expect.stringContaining('st.notes ILIKE'),
        // Single-date compare casts both sides to ::date.
        expect.stringContaining('::date <='),
        expect.stringContaining('SUM(l.line_value)'),
      ]),
    );
  });
});

describe('SearchStockTransfersV2Handler — footer grand total', () => {
  const actorLocal = actor;

  function setup(totals: { total: string; totalAmount: string }) {
    const builders: any[] = [];
    const repo = {
      createQueryBuilder: jest.fn(() => {
        const qb = makeQb([], totals);
        builders.push(qb);
        return qb;
      }),
      manager: {},
    };
    const userRepo = { find: jest.fn().mockResolvedValue([]) };
    return { builders, repo, userRepo };
  }

  async function handlerWith(repo: unknown, userRepo: unknown) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchStockTransfersV2Handler,
        { provide: getRepositoryToken(StockTransferEntity), useValue: repo },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
      ],
    }).compile();
    return module.get(SearchStockTransfersV2Handler);
  }

  it('reads totalAmount from a second query over the whole filtered set', async () => {
    const { builders, repo, userRepo } = setup({ total: '27', totalAmount: '16040000' });
    const handler = await handlerWith(repo, userRepo);

    const result = await handler.execute(new SearchStockTransfersV2Query({}, actorLocal));

    expect(result.totals.totalAmount).toBe(16040000);
    expect(result.total).toBe(27);
    expect(builders[1].select).toHaveBeenCalledWith('COUNT(*)', 'total');
    expect(builders[1].addSelect).toHaveBeenCalledWith(
      expect.stringContaining('SUM(l.line_value)'),
      'totalAmount',
    );
  });

  it('never joins lines in the totals query — a multi-line transfer must count once', async () => {
    const { builders, repo, userRepo } = setup({ total: '1', totalAmount: '340000' });
    const handler = await handlerWith(repo, userRepo);

    await handler.execute(new SearchStockTransfersV2Query({}, actorLocal));

    // Joining a one-to-many `lines` here would multiply each transfer by its
    // line count and inflate the SUM behind the footer.
    expect(builders[1].leftJoinAndSelect).not.toHaveBeenCalled();
  });

  it('is invariant to limit: page size never changes the grand total', async () => {
    const { repo, userRepo } = setup({ total: '27', totalAmount: '16040000' });
    const handler = await handlerWith(repo, userRepo);

    const small = await handler.execute(
      new SearchStockTransfersV2Query({ limit: 1 }, actorLocal),
    );
    const large = await handler.execute(
      new SearchStockTransfersV2Query({ limit: 100 }, actorLocal),
    );

    expect(small.totals.totalAmount).toBe(large.totals.totalAmount);
    expect(small.total).toBe(large.total);
  });
});
