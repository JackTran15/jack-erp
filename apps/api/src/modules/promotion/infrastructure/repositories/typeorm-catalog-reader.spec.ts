import { TypeormCatalogReader } from './typeorm-catalog-reader';

function mockRepo(findResult: unknown[]) {
  return { find: jest.fn().mockResolvedValue(findResult) } as any;
}

describe('TypeormCatalogReader', () => {
  it('builds categoryPathIds including the full ancestor chain (3-level tree)', async () => {
    const items = [
      { id: 'item-1', code: 'SKU1', name: 'Item 1', unit: 'cai', sellingPrice: '100000', productId: undefined, categoryId: 'child' },
    ];
    const categories = [
      { id: 'child', parentGroupId: 'parent' },
      { id: 'parent', parentGroupId: 'grandparent' },
      { id: 'grandparent', parentGroupId: undefined },
    ];
    const reader = new TypeormCatalogReader(mockRepo(items), mockRepo(categories));

    const result = await reader.loadItems('org-1', ['item-1']);

    expect(result.get('item-1')?.categoryPathIds).toEqual(['child', 'parent', 'grandparent']);
  });

  it('stops at MAX_CATEGORY_DEPTH (50) instead of looping forever on a cyclic tree', async () => {
    const items = [{ id: 'item-1', code: 'SKU1', name: 'Item 1', unit: 'cai', sellingPrice: '100000', categoryId: 'a' }];
    // a -> b -> a -> b -> ... — a cycle that would hang without the depth guard.
    const categories = [
      { id: 'a', parentGroupId: 'b' },
      { id: 'b', parentGroupId: 'a' },
    ];
    const reader = new TypeormCatalogReader(mockRepo(items), mockRepo(categories));

    const result = await reader.loadItems('org-1', ['item-1']);

    expect(result.get('item-1')?.categoryPathIds).toHaveLength(50);
  });

  it('converts the numeric sellingPrice column (a string at runtime) to a real number', async () => {
    const items = [{ id: 'item-1', code: 'SKU1', name: 'Item 1', unit: 'cai', sellingPrice: '685000.00', categoryId: undefined }];
    const reader = new TypeormCatalogReader(mockRepo(items), mockRepo([]));

    const result = await reader.loadItems('org-1', ['item-1']);

    expect(result.get('item-1')?.sellingPrice).toBe(685000);
  });

  it('returns an empty map without querying when itemIds is empty', async () => {
    const itemRepo = mockRepo([]);
    const categoryRepo = mockRepo([]);
    const reader = new TypeormCatalogReader(itemRepo, categoryRepo);

    const result = await reader.loadItems('org-1', []);

    expect(result.size).toBe(0);
    expect(itemRepo.find).not.toHaveBeenCalled();
  });

  it('an item with no category gets an empty categoryPathIds', async () => {
    const items = [{ id: 'item-1', code: 'SKU1', name: 'Item 1', unit: 'cai', sellingPrice: '10000', categoryId: undefined }];
    const reader = new TypeormCatalogReader(mockRepo(items), mockRepo([]));

    const result = await reader.loadItems('org-1', ['item-1']);

    expect(result.get('item-1')?.categoryPathIds).toEqual([]);
  });
});
