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
  let repo: { createQueryBuilder: jest.Mock; manager: { find: jest.Mock } };
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    repo = {
      createQueryBuilder: jest.fn(() => qb),
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

  it('scopes by org and active branch, hides CANCELLED, and joins relations', async () => {
    await build([]);
    await handler.execute(new SearchGoodsIssuesV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('gi.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('gi.status != :cancelled', {
      cancelled: GoodsIssueStatus.CANCELLED,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('gi.branchId = :branchId', {
      branchId: 'branch-1',
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

    const andWhereSql = qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
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
