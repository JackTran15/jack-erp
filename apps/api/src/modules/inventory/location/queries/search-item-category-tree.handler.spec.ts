import { ItemCategoryStatus } from '../item-category.entity';
import { SearchItemCategoryTreeHandler } from './search-item-category-tree.handler';
import { SearchItemCategoryTreeQuery } from './search-item-category-tree.query';

type Row = {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  parentGroupId?: string | null;
  status?: ItemCategoryStatus;
};

const actor = { organizationId: 'org1', userId: 'u1', roles: [] } as never;

function handlerWith(rows: Row[]): SearchItemCategoryTreeHandler {
  const repo = {
    find: jest.fn().mockResolvedValue(
      rows.map((r) => ({
        code: null,
        status: ItemCategoryStatus.ACTIVE,
        parentGroupId: null,
        ...r,
      })),
    ),
  };
  return new SearchItemCategoryTreeHandler(repo as never);
}

describe('SearchItemCategoryTreeHandler', () => {
  it('nests children under their parent and lists roots first', async () => {
    const handler = handlerWith([
      { id: 'p1', name: 'Áo' },
      { id: 'c1', name: 'Áo thun', parentGroupId: 'p1' },
      { id: 'c2', name: 'Áo khoác', parentGroupId: 'p1' },
      { id: 'p2', name: 'Quần' },
    ]);

    const { data } = await handler.execute(
      new SearchItemCategoryTreeQuery({}, actor),
    );

    expect(data.map((n) => n.id)).toEqual(['p1', 'p2']);
    const p1 = data.find((n) => n.id === 'p1')!;
    expect(p1.children.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(data.find((n) => n.id === 'p2')!.children).toEqual([]);
  });

  it('carries each node description (null when absent)', async () => {
    const handler = handlerWith([
      { id: 'p1', name: 'Áo', description: 'Nhóm áo' },
      { id: 'c1', name: 'Áo thun', parentGroupId: 'p1' },
    ]);

    const { data } = await handler.execute(
      new SearchItemCategoryTreeQuery({}, actor),
    );

    expect(data[0].description).toBe('Nhóm áo');
    expect(data[0].children[0].description).toBeNull();
  });

  it('treats a child whose parent is missing as a root', async () => {
    const handler = handlerWith([
      { id: 'orphan', name: 'Mồ côi', parentGroupId: 'deleted-parent' },
    ]);

    const { data } = await handler.execute(
      new SearchItemCategoryTreeQuery({}, actor),
    );

    expect(data.map((n) => n.id)).toEqual(['orphan']);
  });

  it('keeps a parent when only a child matches the search', async () => {
    const handler = handlerWith([
      { id: 'p1', name: 'Áo', code: 'AO' },
      { id: 'c1', name: 'Áo thun', parentGroupId: 'p1', code: 'AOTHUN' },
      { id: 'c2', name: 'Áo khoác', parentGroupId: 'p1', code: 'AOKHOAC' },
      { id: 'p2', name: 'Quần', code: 'QUAN' },
    ]);

    const { data } = await handler.execute(
      new SearchItemCategoryTreeQuery({ search: 'thun' }, actor),
    );

    // Only p1 survives (via its matching child); its non-matching child is pruned.
    expect(data.map((n) => n.id)).toEqual(['p1']);
    expect(data[0].children.map((c) => c.id)).toEqual(['c1']);
  });
});
