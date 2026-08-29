import { Repository } from 'typeorm';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { resolveDescendantCategoryIds } from './report-scope.util';

const ORG = 'org-1';
const IMPOSSIBLE = '00000000-0000-0000-0000-000000000000';

/** A repository stub returning the given adjacency list for the org under test. */
function repoOf(
  rows: Array<{ id: string; parentGroupId: string | null }>,
): Repository<ItemCategoryEntity> {
  return {
    find: jest.fn().mockResolvedValue(rows),
  } as unknown as Repository<ItemCategoryEntity>;
}

describe('resolveDescendantCategoryIds', () => {
  it('returns undefined when no group is selected', async () => {
    const repo = repoOf([]);
    await expect(
      resolveDescendantCategoryIds(repo, undefined, ORG),
    ).resolves.toBeUndefined();
    expect(repo.find).not.toHaveBeenCalled();
  });

  it('includes every level below the selected group', async () => {
    const repo = repoOf([
      { id: 'grandparent', parentGroupId: null },
      { id: 'parent', parentGroupId: 'grandparent' },
      { id: 'child', parentGroupId: 'parent' },
      { id: 'unrelated', parentGroupId: null },
    ]);

    const ids = await resolveDescendantCategoryIds(repo, 'grandparent', ORG);

    expect(ids?.sort()).toEqual(['child', 'grandparent', 'parent']);
  });

  it('returns only the group itself for a leaf', async () => {
    const repo = repoOf([
      { id: 'parent', parentGroupId: null },
      { id: 'leaf', parentGroupId: 'parent' },
    ]);

    await expect(resolveDescendantCategoryIds(repo, 'leaf', ORG)).resolves.toEqual([
      'leaf',
    ]);
  });

  it('returns the impossible id for a group outside the organization', async () => {
    const repo = repoOf([{ id: 'mine', parentGroupId: null }]);

    await expect(
      resolveDescendantCategoryIds(repo, 'someone-elses', ORG),
    ).resolves.toEqual([IMPOSSIBLE]);
  });

  it('terminates on a malformed tree containing a cycle', async () => {
    const repo = repoOf([
      { id: 'a', parentGroupId: 'b' },
      { id: 'b', parentGroupId: 'a' },
    ]);

    const ids = await resolveDescendantCategoryIds(repo, 'a', ORG);

    expect(ids?.sort()).toEqual(['a', 'b']);
  });

  it('scopes the lookup to the actor organization', async () => {
    const repo = repoOf([{ id: 'a', parentGroupId: null }]);

    await resolveDescendantCategoryIds(repo, 'a', ORG);

    expect(repo.find).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      select: { id: true, parentGroupId: true },
    });
  });
});
