/**
 * Client-side helpers for the Nhóm hàng hoá (inventory item categories) tree
 * list. The backend `/v2/inventory/item-categories/tree` endpoint returns a
 * nested parent → child structure; the table renders a flattened, depth-ordered
 * projection of it with per-parent collapse support.
 */

export interface ItemCategoryTreeNode {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  parentGroupId: string | null;
  status: string;
  children: ItemCategoryTreeNode[];
}

export interface ItemCategoryTreeResponse {
  data: ItemCategoryTreeNode[];
}

/** Flattened row fed to the table. Tree metadata is carried on `__`-prefixed keys. */
export interface FlatCategoryRow extends Record<string, unknown> {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  parentGroupId: string | null;
  status: string;
  __depth: number;
  __hasChildren: boolean;
  __collapsed: boolean;
}

/**
 * Depth-first flatten (roots first, each followed by its subtree). When
 * `collapsed` is provided, the descendants of any collapsed node are skipped.
 */
export function flattenCategoryTree(
  nodes: ItemCategoryTreeNode[],
  collapsed?: Set<string>,
  depth = 0,
): FlatCategoryRow[] {
  const out: FlatCategoryRow[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = hasChildren && (collapsed?.has(node.id) ?? false);
    out.push({
      id: node.id,
      code: node.code,
      name: node.name,
      description: node.description,
      parentGroupId: node.parentGroupId,
      status: node.status,
      __depth: depth,
      __hasChildren: hasChildren,
      __collapsed: isCollapsed,
    });
    if (hasChildren && !isCollapsed) {
      out.push(...flattenCategoryTree(node.children, collapsed, depth + 1));
    }
  }
  return out;
}

/** Ids of every node that has children — used to collapse the whole tree at once. */
export function collectParentIds(nodes: ItemCategoryTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (ns: ItemCategoryTreeNode[]) => {
    for (const node of ns) {
      if (node.children.length > 0) {
        ids.push(node.id);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}
