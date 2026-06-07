import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransferOrderStatus } from '@erp/shared-interfaces';
import { StringOperator } from '../../../../common/filters/filter.dto';
import { TransferOrderEntity } from '../transfer-order.entity';
import { SearchTransferOrdersV2Handler } from './search-transfer-orders-v2.handler';
import { SearchTransferOrdersV2Query } from './search-transfer-orders-v2.query';
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

// Sub-query builder used by matchingBranchIds (resolves branch-name → ids).
function makeSubQb(ids: string[]) {
  const sub: any = {
    select: jest.fn(() => sub),
    from: jest.fn(() => sub),
    where: jest.fn(() => sub),
    andWhere: jest.fn(() => sub),
    getRawMany: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
  };
  return sub;
}

describe('SearchTransferOrdersV2Handler', () => {
  let handler: SearchTransferOrdersV2Handler;
  let repo: any;
  let qb: ReturnType<typeof makeQb>;
  let subQb: ReturnType<typeof makeSubQb>;

  async function build(rows: unknown[], total = rows.length, branchIds: string[] = []) {
    qb = makeQb([rows, total]);
    subQb = makeSubQb(branchIds);
    repo = {
      createQueryBuilder: jest.fn(() => qb),
      manager: { createQueryBuilder: jest.fn(() => subQb) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchTransferOrdersV2Handler,
        { provide: getRepositoryToken(TransferOrderEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchTransferOrdersV2Handler);
  }

  it('scopes by org, joins lines, and does NOT join branches onto the paginated query', async () => {
    await build([]);
    await handler.execute(new SearchTransferOrdersV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('to_.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('to_.lines', 'lines');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('lines.item', 'lineItem');
    expect(qb.orderBy).toHaveBeenCalledWith('to_.createdAt', 'DESC');
    // No branch filter → no branch-id resolution sub-query.
    expect(repo.manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('scopes a different org with that org id (cross-org isolation)', async () => {
    await build([]);
    await handler.execute(
      new SearchTransferOrdersV2Query({}, { ...actor, organizationId: 'org-2' }),
    );

    expect(qb.where).toHaveBeenCalledWith('to_.organizationId = :orgId', {
      orgId: 'org-2',
    });
    const orgValues = qb.where.mock.calls.map(
      (c: unknown[]) => (c[1] as { orgId: string }).orgId,
    );
    expect(orgValues).not.toContain('org-1');
  });

  it('returns the eager rows unchanged in the { data, total, page, limit } envelope', async () => {
    const rows = [
      {
        id: 'to-1',
        documentNumber: 'LDC000001',
        status: TransferOrderStatus.DRAFT,
        lines: [{ requestedQty: '3' }],
      },
    ];
    await build(rows, 12);
    const result = await handler.execute(
      new SearchTransferOrdersV2Query({ page: 2, limit: 10 }, actor),
    );
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result.data).toBe(rows);
    expect(result.total).toBe(12);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it('resolves a destination-branch name filter to ids and applies an IN clause (plus status/notes/date)', async () => {
    await build([], 0, ['br-2', 'br-9']); // branch-name lookup resolves two ids
    await handler.execute(
      new SearchTransferOrdersV2Query(
        {
          status: { value: TransferOrderStatus.EXECUTED },
          destinationBranch: { operator: StringOperator.CONTAINS, value: 'Hà Nội' },
          notes: { operator: StringOperator.CONTAINS, value: 'gấp' },
          date: { from: '2026-01-01', to: '2026-01-31' },
        },
        actor,
      ),
    );

    // Branch name matched on the branches sub-query, org-scoped.
    expect(repo.manager.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(subQb.where).toHaveBeenCalledWith('b.organization_id = :orgId', {
      orgId: 'org-1',
    });

    const andWhereCalls = qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereCalls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('to_.status ='),
        expect.stringContaining('to_.notes ILIKE'),
        expect.stringContaining('COALESCE(to_.requested_date, to_.created_at) >='),
        expect.stringContaining('COALESCE(to_.requested_date, to_.created_at) <'),
        'to_.destination_branch_id IN (:...dstBranchIds)',
      ]),
    );
    const inCall = qb.andWhere.mock.calls.find(
      (c: unknown[]) => c[0] === 'to_.destination_branch_id IN (:...dstBranchIds)',
    );
    expect(inCall?.[1]).toEqual({ dstBranchIds: ['br-2', 'br-9'] });
  });

  it('forces an empty result when a branch filter matches no branch', async () => {
    await build([], 0, []); // lookup resolves zero ids
    await handler.execute(
      new SearchTransferOrdersV2Query(
        { sourceBranch: { operator: StringOperator.EQUALS, value: 'Nonexistent' } },
        actor,
      ),
    );
    const andWhereCalls = qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereCalls).toContain('1 = 0');
  });
});
