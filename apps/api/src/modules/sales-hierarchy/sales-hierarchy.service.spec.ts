import { NotFoundException } from '@nestjs/common';
import { SalesHierarchyService } from './sales-hierarchy.service';
import { ActorContext } from '../../common/decorators/actor-context.decorator';

const ORG = 'org-1';
const BRANCH = 'branch-1';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: ORG,
  branchId: BRANCH,
  roles: [],
};

/**
 * The assertions are on the SQL the builder is asked to produce, not on rows.
 * The failure this guards against — the branch predicate keyed on the profile id
 * instead of the user id, or dropped altogether — returns a perfectly plausible
 * list either way, so only the predicate itself can tell the two apart.
 */
function qbStub(rows: any[]) {
  const where: Array<[string, any]> = [];
  const order: string[] = [];
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    innerJoin: jest.fn(() => qb),
    where: jest.fn((sql: string, p?: any) => {
      where.push([sql, p]);
      return qb;
    }),
    andWhere: jest.fn((sql: string, p?: any) => {
      where.push([sql, p]);
      return qb;
    }),
    orderBy: jest.fn((c: string) => {
      order.push(c);
      return qb;
    }),
    getMany: jest.fn(async () => rows),
  };
  return { qb, seen: () => ({ where, order }) };
}

function build(profiles: any[], users: any[] = [], branchFound = true) {
  const { qb, seen } = qbStub(profiles);
  const employeeRepo = { createQueryBuilder: jest.fn(() => qb) };
  const userRepo = { find: jest.fn(async () => users) };
  const branchRepo = {
    findOne: jest.fn(async () => (branchFound ? { id: BRANCH } : null)),
  };
  const service = new SalesHierarchyService(
    {} as any,
    {} as any,
    branchRepo as any,
    userRepo as any,
    employeeRepo as any,
    {} as any,
  );
  return { service, seen, qb, branchRepo };
}

const profile = (over: Partial<any> = {}) => ({
  id: 'emp-1',
  userId: 'usr-1',
  code: 'NV000002',
  jobPosition: { name: 'Nhân viên bán hàng' },
  mobile: null,
  ...over,
});

describe('SalesHierarchyService.listSalesmen', () => {
  it('scopes to the branch on the path through user_branch_assignments', async () => {
    const { service, seen } = build([]);

    await service.listSalesmen(BRANCH, actor);

    const { where } = seen();
    const [sql, params] = where.find(([s]) =>
      s.includes('user_branch_assignments'),
    )!;
    expect(sql).toContain('uba.user_id = u.id');
    expect(params).toEqual({ scopeBranchId: BRANCH });
    expect(where.some(([s]) => s.includes('e.organizationId = :organizationId'))).toBe(true);
  });

  // The trap: user_branch_assignments.user_id points at users.id. Keyed on the
  // profile id the predicate matches nothing, and the picker reads as "this branch
  // has no salespeople" rather than as a bug.
  it('keys the predicate on the user id, never on the profile id', async () => {
    const { service, seen } = build([]);

    await service.listSalesmen(BRANCH, actor);

    const [sql] = seen().where.find(([s]) =>
      s.includes('user_branch_assignments'),
    )!;
    expect(sql).not.toContain('uba.user_id = e.id');
  });

  it('projects public-safe fields with the name from the linked user account', async () => {
    const { service } = build(
      [profile()],
      [{ id: 'usr-1', firstName: 'Sales', lastName: 'HCM' }],
    );

    const out = await service.listSalesmen(BRANCH, actor);

    expect(out).toEqual([
      {
        id: 'emp-1',
        userId: 'usr-1',
        code: 'NV000002',
        fullName: 'Sales HCM',
        jobPosition: 'Nhân viên bán hàng',
        mobile: null,
      },
    ]);
  });

  it('rejects a branch outside the actor organization before querying people', async () => {
    const { service, qb } = build([], [], false);

    await expect(service.listSalesmen(BRANCH, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(qb.getMany).not.toHaveBeenCalled();
  });

  it('applies the same scope to sales managers', async () => {
    const { service, seen } = build([]);

    await service.listSalesManagers(BRANCH, actor);

    const [, params] = seen().where.find(([s]) =>
      s.includes('user_branch_assignments'),
    )!;
    expect(params).toEqual({ scopeBranchId: BRANCH });
  });
});
