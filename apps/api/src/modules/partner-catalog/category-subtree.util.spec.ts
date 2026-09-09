import {
  CategoryTreeRow,
  collectCategorySubtreeIds,
  indexChildren,
} from './category-subtree.util';

// nam ─┬─ giay-nam ─┬─ giay-tay
//      │            └─ giay-boot
//      └─ dep-nam
// phu-kien (separate root)
const ROWS: CategoryTreeRow[] = [
  { id: 'nam', parentGroupId: null },
  { id: 'giay-nam', parentGroupId: 'nam' },
  { id: 'giay-tay', parentGroupId: 'giay-nam' },
  { id: 'giay-boot', parentGroupId: 'giay-nam' },
  { id: 'dep-nam', parentGroupId: 'nam' },
  { id: 'phu-kien', parentGroupId: null },
];

describe('collectCategorySubtreeIds', () => {
  it('returns the root itself plus every descendant, three levels deep', () => {
    expect(collectCategorySubtreeIds('nam', ROWS).sort()).toEqual(
      ['dep-nam', 'giay-boot', 'giay-nam', 'giay-tay', 'nam'].sort(),
    );
  });

  it('stops at the requested subtree', () => {
    expect(collectCategorySubtreeIds('giay-nam', ROWS).sort()).toEqual(
      ['giay-boot', 'giay-nam', 'giay-tay'].sort(),
    );
  });

  it('returns just the node for a leaf', () => {
    expect(collectCategorySubtreeIds('giay-tay', ROWS)).toEqual(['giay-tay']);
  });

  it('returns nothing for an id outside the row set', () => {
    // This is the cross-organization case: the caller then matches zero rows
    // rather than raising, which is what the search endpoint wants.
    expect(collectCategorySubtreeIds('not-mine', ROWS)).toEqual([]);
  });

  it('terminates on a cycle instead of recursing forever', () => {
    const cyclic: CategoryTreeRow[] = [
      { id: 'a', parentGroupId: 'b' },
      { id: 'b', parentGroupId: 'a' },
    ];
    expect(collectCategorySubtreeIds('a', cyclic).sort()).toEqual(['a', 'b']);
  });
});

describe('indexChildren', () => {
  it('groups children under their parent', () => {
    const children = indexChildren(ROWS);
    expect(children.get('nam')!.map((r) => r.id).sort()).toEqual([
      'dep-nam',
      'giay-nam',
    ]);
  });

  it('treats a row whose parent is absent as a root', () => {
    // Mirrors ON DELETE SET NULL and status filtering: the parent row is gone,
    // so the child must surface at the top rather than disappear.
    const orphaned: CategoryTreeRow[] = [
      { id: 'child', parentGroupId: 'deleted-parent' },
    ];
    expect(indexChildren(orphaned).get(null)!.map((r) => r.id)).toEqual([
      'child',
    ]);
  });

  it('puts both roots under the null key', () => {
    expect(indexChildren(ROWS).get(null)!.map((r) => r.id).sort()).toEqual([
      'nam',
      'phu-kien',
    ]);
  });
});
