import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  ItemCategoryEntity,
  ItemCategoryStatus,
} from '../../inventory/location/item-category.entity';
import { PartnerCategoryNodeDto } from '../dto/partner-category-tree.dto';
import { SearchPartnerCategoriesHandler } from './search-partner-categories.handler';
import { SearchPartnerCategoriesQuery } from './search-partner-categories.query';

const actor: ActorContext = {
  userId: 'partner-shadow-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

type Row = Pick<
  ItemCategoryEntity,
  'id' | 'code' | 'name' | 'parentGroupId' | 'status'
>;

const cat = (id: string, code: string, name: string, parent?: string): Row => ({
  id,
  code,
  name,
  parentGroupId: parent,
  status: ItemCategoryStatus.ACTIVE,
});

// GIÀY DÉP ─┬─ Giày nữ ── Giày cao gót
//           └─ Dép nữ
const TREE: Row[] = [
  cat('giay-dep', '01', 'GIÀY DÉP'),
  cat('giay-nu', '1002', 'Giày nữ', 'giay-dep'),
  cat('cao-got', '100201', 'Giày cao gót', 'giay-nu'),
  cat('dep-nu', '1006', 'Dép nữ', 'giay-dep'),
];

const byId = (nodes: PartnerCategoryNodeDto[], id: string): PartnerCategoryNodeDto => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = byId(node.children, id);
    if (hit) return hit;
  }
  return undefined as unknown as PartnerCategoryNodeDto;
};

describe('SearchPartnerCategoriesHandler', () => {
  let handler: SearchPartnerCategoriesHandler;
  let find: jest.Mock;
  let query: jest.Mock;

  const build = async (rows: Row[], pairs: object[]) => {
    find = jest.fn().mockResolvedValue(rows);
    query = jest.fn().mockResolvedValue(pairs);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPartnerCategoriesHandler,
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { find, manager: { query } },
        },
      ],
    }).compile();
    handler = moduleRef.get(SearchPartnerCategoriesHandler);
    return handler.execute(new SearchPartnerCategoriesQuery({}, actor));
  };

  // AC-01
  it('nests three levels under the root', async () => {
    const { data } = await build(TREE, []);

    expect(data.map((n) => n.id)).toEqual(['giay-dep']);
    expect(data[0]!.children.map((n) => n.id).sort()).toEqual([
      'dep-nu',
      'giay-nu',
    ]);
    expect(byId(data, 'giay-nu').children.map((n) => n.id)).toEqual(['cao-got']);
    expect(byId(data, 'cao-got').parentId).toBe('giay-nu');
    expect(data[0]!.parentId).toBeNull();
  });

  // AC-02
  it('scopes to the actor organization and to ACTIVE categories', async () => {
    await build(TREE, []);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          status: ItemCategoryStatus.ACTIVE,
        },
      }),
    );
    expect(query).toHaveBeenCalledWith(expect.any(String), ['org-1']);
  });

  // AC-03 — the bug this endpoint exists to not repeat: a parent category has
  // no items attached directly, so counting only direct links reports zero.
  it('rolls the product count up to a parent that holds nothing directly', async () => {
    const pairs = [
      { categoryId: 'giay-nu', productId: 'p1' },
      { categoryId: 'giay-nu', productId: 'p2' },
      { categoryId: 'cao-got', productId: 'p3' },
      { categoryId: 'dep-nu', productId: 'p4' },
    ];
    const { data } = await build(TREE, pairs);

    expect(byId(data, 'cao-got').productCount).toBe(1);
    expect(byId(data, 'giay-nu').productCount).toBe(3); // own 2 + child 1
    expect(byId(data, 'dep-nu').productCount).toBe(1);
    expect(byId(data, 'giay-dep').productCount).toBe(4); // whole subtree
  });

  it('counts a product in two sibling categories once at the shared parent', async () => {
    const pairs = [
      { categoryId: 'giay-nu', productId: 'shared' },
      { categoryId: 'dep-nu', productId: 'shared' },
    ];
    const { data } = await build(TREE, pairs);

    expect(byId(data, 'giay-nu').productCount).toBe(1);
    expect(byId(data, 'dep-nu').productCount).toBe(1);
    // Summing the children would say 2. It is one product.
    expect(byId(data, 'giay-dep').productCount).toBe(1);
  });

  // AC-04
  it('returns an empty list for an organization with no categories', async () => {
    await expect(build([], [])).resolves.toEqual({ data: [] });
  });

  it('surfaces a category whose parent was filtered out as a root', async () => {
    const orphan: Row[] = [cat('giay-nu', '1002', 'Giày nữ', 'inactive-parent')];
    const { data } = await build(orphan, []);

    expect(data.map((n) => n.id)).toEqual(['giay-nu']);
    expect(data[0]!.parentId).toBe('inactive-parent');
  });

  it('does not leak internal category fields', async () => {
    const { data } = await build(TREE, []);

    expect(Object.keys(data[0]!).sort()).toEqual([
      'children',
      'code',
      'id',
      'name',
      'parentId',
      'productCount',
    ]);
  });
});
