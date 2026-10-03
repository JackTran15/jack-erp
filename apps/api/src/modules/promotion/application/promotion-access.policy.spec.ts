import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  PROMOTION_CHAIN_MANAGE_PERMISSION,
  PromotionAccess,
  PromotionAccessPolicy,
  scopeForOwner,
} from './promotion-access.policy';

const HCM = 'branch-hcm';
const HN = 'branch-hn';

const program = (ownerBranchId: string | undefined, branchIds: string[]) => ({ id: 'p-1', ownerBranchId, branchIds });

/** The access table of 03-logical-design.md, one row per program shape. */
const ROWS = [
  { label: 'owned by the active branch', program: program(HCM, [HCM]), read: true, manage: true },
  { label: 'owned by another branch', program: program(HN, [HN]), read: false, manage: false },
  { label: 'chain, whole chain', program: program(undefined, []), read: true, manage: false },
  { label: 'chain, scoped to the active branch', program: program(undefined, [HCM, HN]), read: true, manage: false },
  { label: 'chain, scoped elsewhere', program: program(undefined, [HN]), read: false, manage: false },
];

describe('PromotionAccess — branch manager, active HCM', () => {
  const access = new PromotionAccess(false, HCM);

  it.each(ROWS)('$label: read=$read manage=$manage', ({ program: p, read, manage }) => {
    expect(access.canRead(p)).toBe(read);
    expect(access.canManage(p)).toBe(manage);
  });

  it.each(ROWS)('$label: asserts answer 404 when unreadable, 403 when readable but not manageable', ({ program: p, read, manage }) => {
    if (!read) {
      expect(() => access.assertReadable(p)).toThrow(NotFoundException);
      expect(() => access.assertManageable(p)).toThrow(NotFoundException);
    } else if (!manage) {
      expect(() => access.assertReadable(p)).not.toThrow();
      expect(() => access.assertManageable(p)).toThrow(ForbiddenException);
    } else {
      expect(() => access.assertManageable(p)).not.toThrow();
    }
  });

  it('uses the same 404 text as a missing program (ADR-06)', () => {
    expect(() => access.assertReadable(program(HN, [HN]))).toThrow('Promotion program "p-1" not found');
  });

  it('owns what it creates and searches its own branch', () => {
    expect(access.ownerForNew()).toBe(HCM);
    expect(access.searchScope()).toEqual({ kind: 'branch', branchId: HCM });
  });
});

describe('PromotionAccess — branch manager without an active branch (A-15)', () => {
  const access = new PromotionAccess(false, undefined);

  it('reads nothing and is refused create and search with 403', () => {
    for (const row of ROWS) expect(access.canRead(row.program)).toBe(false);
    expect(() => access.ownerForNew()).toThrow(ForbiddenException);
    expect(() => access.searchScope()).toThrow(ForbiddenException);
  });
});

describe('PromotionAccess — chain manager', () => {
  const access = new PromotionAccess(true, HN);

  it.each(ROWS)('$label: read + manage', ({ program: p }) => {
    expect(access.canRead(p)).toBe(true);
    expect(access.canManage(p)).toBe(true);
    expect(() => access.assertManageable(p)).not.toThrow();
  });

  it('creates chain-owned programs and searches the whole chain, even with no active branch', () => {
    expect(access.ownerForNew()).toBeUndefined();
    expect(access.searchScope()).toEqual({ kind: 'chain' });
    expect(new PromotionAccess(true, undefined).ownerForNew()).toBeUndefined();
  });
});

describe('scopeForOwner (ADR-04)', () => {
  it('pins a branch program to its owner and leaves a chain program as requested', () => {
    expect(scopeForOwner(HCM, [HN])).toEqual([HCM]);
    expect(scopeForOwner(undefined, [HN])).toEqual([HN]);
  });
});

describe('PromotionAccessPolicy.forActor', () => {
  const actor: ActorContext = { userId: 'u-1', organizationId: 'org-1', branchId: HCM, roles: [] };

  it.each([true, false])('reads promotion.chain.manage once (holds=%s) and keeps the active branch', async (holds) => {
    const rbac = { hasPermission: jest.fn().mockResolvedValue(holds) };
    const access = await new PromotionAccessPolicy(rbac as any).forActor(actor);

    expect(rbac.hasPermission).toHaveBeenCalledWith('u-1', 'org-1', PROMOTION_CHAIN_MANAGE_PERMISSION);
    expect(access.isChainManager).toBe(holds);
    expect(access.activeBranchId).toBe(HCM);
  });
});
