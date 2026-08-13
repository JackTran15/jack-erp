import { TypeormPromotionRepository } from './typeorm-promotion.repository';

/**
 * findActive deliberately loads *candidates*, not qualifiers: status, date
 * window and branch scope are decided by checkGenericEligibility so the POS can
 * show the cashier a reason. These tests pin that the SQL no longer pre-filters
 * on any of the three, and that the ±1 year guard rail (A-05) is still there to
 * stop the query dragging in years of history.
 */
describe('TypeormPromotionRepository.findActive', () => {
  function build() {
    const conditions: Array<{ sql: string; params?: Record<string, unknown> }> = [];
    const qb: any = {
      where: jest.fn((sql: string, params?: Record<string, unknown>) => {
        conditions.push({ sql, params });
        return qb;
      }),
      andWhere: jest.fn((sql: string, params?: Record<string, unknown>) => {
        conditions.push({ sql, params });
        return qb;
      }),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const programRepo = { createQueryBuilder: jest.fn(() => qb) };
    const emptyRepo = { find: jest.fn().mockResolvedValue([]) };
    const repo = new TypeormPromotionRepository(
      programRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      {} as any,
    );
    return { repo, conditions };
  }

  const sqlOf = (conditions: Array<{ sql: string }>) =>
    conditions.map((c) => c.sql).join(' | ');

  it('does not filter on status — a STOPPED program must reach the engine to earn its reason', async () => {
    const { repo, conditions } = build();
    await repo.findActive('org-1', 'branch-1', new Date('2026-08-13T10:00:00.000Z'));
    expect(sqlOf(conditions)).not.toMatch(/status/i);
  });

  it('does not filter on branch scope — BRANCH_SCOPE is the engine’s call', async () => {
    const { repo, conditions } = build();
    await repo.findActive('org-1', 'branch-1', new Date('2026-08-13T10:00:00.000Z'));
    expect(sqlOf(conditions)).not.toMatch(/promotion_branches/i);
  });

  it('still scopes to the organization and skips soft-deleted rows', async () => {
    const { repo, conditions } = build();
    await repo.findActive('org-1', 'branch-1', new Date('2026-08-13T10:00:00.000Z'));
    const sql = sqlOf(conditions);
    expect(sql).toMatch(/organizationId/);
    expect(sql).toMatch(/deletedAt IS NULL/);
    expect(conditions.some((c) => c.params?.orgId === 'org-1')).toBe(true);
  });

  it('keeps a ±1 year date guard rail so the query cannot drag in all history (A-05)', async () => {
    const { repo, conditions } = build();
    const at = new Date('2026-08-13T10:00:00.000Z');
    await repo.findActive('org-1', 'branch-1', at);

    const from = conditions.find((c) => c.params?.from)?.params?.from as Date;
    const to = conditions.find((c) => c.params?.to)?.params?.to as Date;

    expect(from.getFullYear()).toBe(at.getFullYear() - 1);
    expect(to.getFullYear()).toBe(at.getFullYear() + 1);
    // Loose, not tight: a programme that ended yesterday is still loaded, so the
    // cashier gets a DATE_WINDOW reason rather than a silently missing row.
    expect(from.getTime()).toBeLessThan(at.getTime());
    expect(to.getTime()).toBeGreaterThan(at.getTime());
  });
});
