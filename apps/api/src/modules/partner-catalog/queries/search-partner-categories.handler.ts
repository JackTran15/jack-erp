import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ItemCategoryEntity,
  ItemCategoryStatus,
} from '../../inventory/location/item-category.entity';
import { indexChildren } from '../category-subtree.util';
import {
  PartnerCategoryNodeDto,
  PartnerCategoryTreeResponseDto,
} from '../dto/partner-category-tree.dto';
import { SearchPartnerCategoriesQuery } from './search-partner-categories.query';

/**
 * Internal tree node. Carries the product id SET rather than a count, because
 * a parent's count is the size of the UNION of its descendants' sets, not the
 * sum of their sizes. Mapped to the DTO once the roll-up is finished.
 */
interface BuiltNode {
  id: string;
  code: string | null;
  name: string;
  parentId: string | null;
  products: Set<string>;
  children: BuiltNode[];
}

/** One (category, product) pair; the grain the product count rolls up from. */
interface CategoryProductPair {
  categoryId: string;
  productId: string;
}

/**
 * Distinct (category, product) pairs rather than a pre-aggregated count per
 * category. Rolling a `COUNT(DISTINCT product_id)` up the tree would count a
 * product twice when its variants sit in two sibling categories — on the
 * reference dataset that is only 3 products out of 4 731, which is precisely
 * the kind of small wrongness nobody notices and nobody can explain later.
 * The pair set is ~4 700 rows, so accuracy is essentially free here.
 */
const PAIRS_SQL = `
  SELECT DISTINCT i.category_id AS "categoryId", i.product_id AS "productId"
  FROM items i
  WHERE i.organization_id = $1
    AND i.is_active = true
    AND i.product_id IS NOT NULL
    AND i.category_id IS NOT NULL
`;

@QueryHandler(SearchPartnerCategoriesQuery)
export class SearchPartnerCategoriesHandler
  implements IQueryHandler<SearchPartnerCategoriesQuery>
{
  constructor(
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
  ) {}

  async execute({
    actor,
  }: SearchPartnerCategoriesQuery): Promise<PartnerCategoryTreeResponseDto> {
    const [rows, pairs] = await Promise.all([
      this.categories.find({
        where: {
          organizationId: actor.organizationId,
          status: ItemCategoryStatus.ACTIVE,
        },
        order: { code: 'ASC', name: 'ASC' },
      }),
      this.categories.manager.query(PAIRS_SQL, [
        actor.organizationId,
      ]) as Promise<CategoryProductPair[]>,
    ]);

    const directProducts = new Map<string, Set<string>>();
    for (const pair of pairs) {
      const bucket = directProducts.get(pair.categoryId);
      if (bucket) bucket.add(pair.productId);
      else directProducts.set(pair.categoryId, new Set([pair.productId]));
    }

    const children = indexChildren(
      rows.map((r) => ({ id: r.id, parentGroupId: r.parentGroupId ?? null })),
    );
    const byId = new Map(rows.map((r) => [r.id, r]));

    // Post-order: a node's product set is its own products unioned with every
    // descendant's, so a parent that holds nothing directly still reports what
    // hangs below it. Guarded against a cycle in parent_group_id, which the
    // self-referencing FK does not prevent and which would otherwise recurse
    // until the stack gives out.
    const building = new Set<string>();
    const build = (id: string): BuiltNode => {
      const row = byId.get(id)!;
      building.add(id);

      const products = new Set(directProducts.get(id) ?? []);
      const childNodes: BuiltNode[] = [];
      for (const child of children.get(id) ?? []) {
        if (building.has(child.id)) continue;
        const node = build(child.id);
        childNodes.push(node);
        for (const productId of node.products) products.add(productId);
      }

      building.delete(id);
      return {
        id: row.id,
        code: row.code ?? null,
        name: row.name,
        parentId: row.parentGroupId ?? null,
        products,
        children: childNodes,
      };
    };

    const toDto = (node: BuiltNode): PartnerCategoryNodeDto => ({
      id: node.id,
      code: node.code,
      name: node.name,
      parentId: node.parentId,
      productCount: node.products.size,
      children: node.children.map(toDto),
    });

    const roots = (children.get(null) ?? []).map((r) => toDto(build(r.id)));
    return { data: roots };
  }
}
