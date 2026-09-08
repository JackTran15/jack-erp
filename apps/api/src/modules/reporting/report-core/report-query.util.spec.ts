import { ForbiddenException } from '@nestjs/common';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { resolveReportBranchIds } from './report-query.util';

function actor(branchIds: string[], branchId = branchIds[0]): ActorContext {
  return {
    userId: 'u1',
    organizationId: 'org-1',
    branchId,
    branchIds,
    roles: [],
  } as unknown as ActorContext;
}

/**
 * The rule this encodes: a store sees its own money and nobody else's, unless it
 * holds the domain's consolidated permission. `null` means "no branch predicate",
 * which only a consolidated actor can reach.
 */
describe('resolveReportBranchIds', () => {
  describe('without the consolidated permission', () => {
    const a = actor(['b1', 'b2']);

    it('falls back to every assigned branch when no store is requested', () => {
      expect(resolveReportBranchIds(false, undefined, undefined, a)).toEqual([
        'b1',
        'b2',
      ]);
    });

    it('treats scope "all" as the assigned branches, not the organization', () => {
      expect(
        resolveReportBranchIds(false, { scope: 'all', storeIds: [] }, undefined, a),
      ).toEqual(['b1', 'b2']);
    });

    it('accepts a group entirely inside the assignments', () => {
      expect(
        resolveReportBranchIds(
          false,
          { scope: 'group', storeIds: ['b2'] },
          undefined,
          a,
        ),
      ).toEqual(['b2']);
    });

    it('403s on a group containing a store the actor is not assigned to', () => {
      expect(() =>
        resolveReportBranchIds(
          false,
          { scope: 'group', storeIds: ['b1', 'b-other'] },
          undefined,
          a,
        ),
      ).toThrow('Access denied for stores: b-other');
    });

    it('accepts a legacy branchId inside the assignments', () => {
      expect(resolveReportBranchIds(false, undefined, 'b2', a)).toEqual(['b2']);
    });

    it('403s on a legacy branchId outside them', () => {
      expect(() =>
        resolveReportBranchIds(false, undefined, 'b-other', a),
      ).toThrow('Access denied for branch: b-other');
    });

    it('403s outright when the actor has no branch assignment at all', () => {
      expect(() =>
        resolveReportBranchIds(false, undefined, undefined, actor([], undefined)),
      ).toThrow(ForbiddenException);
    });

    it('uses every assignment, not just the active branch', () => {
      // This is the behaviour change from the old `actor.branchId` floor: a
      // manager of two stores sees both without a consolidated grant.
      expect(resolveReportBranchIds(false, undefined, undefined, actor(['b1', 'b2'], 'b1')))
        .toEqual(['b1', 'b2']);
    });
  });

  describe('with the consolidated permission', () => {
    const a = actor(['b1']);

    it('drops the branch predicate when nothing is requested', () => {
      expect(resolveReportBranchIds(true, undefined, undefined, a)).toBeNull();
    });

    it('drops it for scope "all"', () => {
      expect(
        resolveReportBranchIds(true, { scope: 'all', storeIds: [] }, undefined, a),
      ).toBeNull();
    });

    it('honours a group of stores the actor is not assigned to', () => {
      expect(
        resolveReportBranchIds(
          true,
          { scope: 'group', storeIds: ['b7', 'b8'] },
          undefined,
          a,
        ),
      ).toEqual(['b7', 'b8']);
    });

    it('works for an actor with no assignments at all', () => {
      expect(
        resolveReportBranchIds(true, undefined, undefined, actor([], undefined)),
      ).toBeNull();
    });
  });

  it('never returns an empty list, which applyBranchScope would read as "no filter"', () => {
    // An empty `storeIds` is the "Tất cả" state of the picker, not a request
    // for nothing.
    expect(
      resolveReportBranchIds(
        false,
        { scope: 'group', storeIds: [] },
        undefined,
        actor(['b1']),
      ),
    ).toEqual(['b1']);
  });
});
