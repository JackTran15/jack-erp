import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { SearchDraftInvoicesV2Handler } from './search-draft-invoices-v2.handler';
import { SearchDraftInvoicesV2Query } from './search-draft-invoices-v2.query';

const actor: ActorContext = {
  userId: 'cashier-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

interface FakeQb {
  leftJoinAndMapOne: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
}

function makeQb(rows: unknown[], total: number): FakeQb {
  const qb: Partial<FakeQb> = {};
  const self = () => qb as FakeQb;
  Object.assign(qb, {
    leftJoinAndMapOne: jest.fn(self),
    where: jest.fn(self),
    andWhere: jest.fn(self),
    orderBy: jest.fn(self),
    skip: jest.fn(self),
    take: jest.fn(self),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
  });
  return qb as FakeQb;
}

/**
 * The invoice grid now filters drafts out server-side. This suite is the other
 * half of that change: the picker the cashier reaches held carts through must
 * keep returning them. If someone ever "tidies up" by hoisting the exclusion
 * into shared query-building, these tests fail before the cashier loses every
 * parked cart.
 */
describe('SearchDraftInvoicesV2Handler', () => {
  let handler: SearchDraftInvoicesV2Handler;
  let qb: FakeQb;

  async function build(rows: unknown[] = [], total = 0) {
    qb = makeQb(rows, total);
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const itemRepo = { find: jest.fn().mockResolvedValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchDraftInvoicesV2Handler,
        { provide: getRepositoryToken(InvoiceEntity), useValue: repo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
      ],
    }).compile();
    handler = module.get(SearchDraftInvoicesV2Handler);
  }

  const predicates = () =>
    qb.andWhere.mock.calls.map((c: unknown[]) => c[0]).filter((p) => typeof p === 'string');

  it('selects drafts, and never excludes them', async () => {
    await build();
    await handler.execute(new SearchDraftInvoicesV2Query({}, actor));

    expect(qb.andWhere).toHaveBeenCalledWith('inv.isDraft = true');
    // The clause the invoice grid gained must not leak into this handler.
    expect(predicates().some((p) => (p as string).includes('status != '))).toBe(false);
    expect(predicates().some((p) => (p as string).includes('isDraft = false'))).toBe(false);
  });

  it('returns every draft the branch has parked', async () => {
    const drafts = [
      { id: 'inv-1', code: 'DRAFT-1' },
      { id: 'inv-2', code: 'DRAFT-2' },
      { id: 'inv-3', code: 'DRAFT-3' },
    ];
    await build(drafts, 3);

    const result = await handler.execute(new SearchDraftInvoicesV2Query({}, actor));

    expect(result.total).toBe(3);
    expect(result.data).toHaveLength(3);
  });

  it('scopes to the organization and the active branch', async () => {
    await build();
    await handler.execute(new SearchDraftInvoicesV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('inv.organizationId = :orgId', { orgId: 'org-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('inv.branchId = :branchId', {
      branchId: 'branch-1',
    });
  });
});
