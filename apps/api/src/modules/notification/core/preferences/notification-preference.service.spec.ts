import { NotificationPreferenceService } from './notification-preference.service';

describe('NotificationPreferenceService', () => {
  const rows = [
    { user_id: 'chain-on', scope_branch_id: null, enabled_types: ['invoice'] },
    { user_id: 'branch-x', scope_branch_id: 'X', enabled_types: ['invoice'] },
    { user_id: 'off', scope_branch_id: null, enabled_types: ['revenue'] },
  ];
  const service = new NotificationPreferenceService({ query: jest.fn().mockResolvedValue(rows) } as any);
  const userIds = ['chain-on', 'branch-x', 'off', 'never-saved'];

  it('keeps chain scope, matching branch scope and never-saved users (default on)', async () => {
    await expect(
      service.filter({ userIds, type: 'invoice', branchId: 'X', defaultEnabled: true }),
    ).resolves.toEqual(['chain-on', 'branch-x', 'never-saved']);
  });

  it('drops a user scoped to another branch', async () => {
    await expect(
      service.filter({ userIds, type: 'invoice', branchId: 'Y', defaultEnabled: true }),
    ).resolves.toEqual(['chain-on', 'never-saved']);
  });

  it('never-saved users follow defaultEnabled', async () => {
    await expect(
      service.filter({ userIds, type: 'invoice', branchId: 'X', defaultEnabled: false }),
    ).resolves.toEqual(['chain-on', 'branch-x']);
  });

  it('organization-level notifications ignore the branch scope', async () => {
    await expect(
      service.filter({ userIds, type: 'invoice', defaultEnabled: false }),
    ).resolves.toEqual(['chain-on', 'branch-x']);
  });

  describe('scope of per-scope firings (daily revenue)', () => {
    it('branchOnly keeps only users scoped to exactly that branch', async () => {
      await expect(
        service.filter({ userIds, type: 'invoice', branchId: 'X', defaultEnabled: true, scope: 'branchOnly' }),
      ).resolves.toEqual(['branch-x']);
    });

    it('chainOnly keeps chain-scoped users — a never-saved user counts as chain-scoped', async () => {
      await expect(
        service.filter({ userIds, type: 'invoice', defaultEnabled: true, scope: 'chainOnly' }),
      ).resolves.toEqual(['chain-on', 'never-saved']);
    });

    it('the type switch still wins over the scope', async () => {
      await expect(
        service.filter({ userIds: ['off'], type: 'invoice', defaultEnabled: true, scope: 'chainOnly' }),
      ).resolves.toEqual([]);
    });
  });

  it('does not query for an empty list', async () => {
    const query = jest.fn();
    await new NotificationPreferenceService({ query } as any).filter({
      userIds: [],
      type: 'invoice',
      defaultEnabled: true,
    });
    expect(query).not.toHaveBeenCalled();
  });
});
