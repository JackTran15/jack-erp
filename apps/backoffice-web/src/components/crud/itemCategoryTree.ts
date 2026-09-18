/**
 * Client-side helpers for tree-mode lists (`CRUD_TREE_ENTITIES`: Nhóm hàng
 * hoá, Danh mục thu chi). The backend `…/tree` endpoints return a nested
 * parent → child structure; the table renders a flattened, depth-ordered
 * projection of it with per-parent collapse support. The Nhóm hàng hoá node
 * types below are kept for their existing callers.
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

/** Flattened Nhóm hàng hoá row fed to the table. Tree metadata is carried on `__`-prefixed keys. */
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

/** Any nested node: an id, a `children` array, and whatever else the endpoint returns. */
interface TreeNodeLike {
  id: string;
  children: TreeNodeLike[];
}

/** Tree metadata carried on `__`-prefixed keys of a flattened row. */
export interface FlatTreeMeta {
  __depth: number;
  __hasChildren: boolean;
  __collapsed: boolean;
}

/**
 * Depth-first flatten (roots first, each followed by its subtree). When
 * `collapsed` is provided, the descendants of any collapsed node are skipped.
 * Every field of the node except `children` is copied onto the row, so the
 * table sees whatever columns the tree endpoint returns.
 */
export function flattenCategoryTree<N extends TreeNodeLike>(
  nodes: N[],
  collapsed?: Set<string>,
  depth = 0,
): Array<Omit<N, "children"> & FlatTreeMeta> {
  const out: Array<Omit<N, "children"> & FlatTreeMeta> = [];
  for (const node of nodes) {
    const { children, ...rest } = node;
    const hasChildren = children.length > 0;
    const isCollapsed = hasChildren && (collapsed?.has(node.id) ?? false);
    out.push({
      ...rest,
      __depth: depth,
      __hasChildren: hasChildren,
      __collapsed: isCollapsed,
    });
    if (hasChildren && !isCollapsed) {
      out.push(
        ...(flattenCategoryTree(children as N[], collapsed, depth + 1)),
      );
    }
  }
  return out;
}

/** Ids of every node that has children — used to collapse the whole tree at once. */
export function collectParentIds(nodes: TreeNodeLike[]): string[] {
  const ids: string[] = [];
  const walk = (ns: TreeNodeLike[]) => {
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
