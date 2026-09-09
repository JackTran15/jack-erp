/**
 * Category-tree helpers shared by the tree endpoint and the product search.
 *
 * `inventory_item_categories` is a plain adjacency list (`parent_group_id`) with
 * no materialised path and no `@Tree` decorator, so "this category and every
 * category under it" has to be computed. It lives in its own file because two
 * handlers in two different Units of Work need exactly the same expansion, and
 * a second copy is how the two drift apart.
 */

/** The minimum a row needs for tree maths. */
export interface CategoryTreeRow {
  id: string;
  parentGroupId: string | null;
}

/** Children indexed by parent id. Rows whose parent is absent are treated as roots. */
export function indexChildren<T extends CategoryTreeRow>(
  rows: readonly T[],
): Map<string | null, T[]> {
  const byId = new Set(rows.map((r) => r.id));
  const children = new Map<string | null, T[]>();
  for (const row of rows) {
    // A parent that is missing from the set (filtered out, or cleared by the
    // ON DELETE SET NULL FK) makes this row a root rather than an orphan.
    const key =
      row.parentGroupId && byId.has(row.parentGroupId) ? row.parentGroupId : null;
    const bucket = children.get(key);
    if (bucket) bucket.push(row);
    else children.set(key, [row]);
  }
  return children;
}

/**
 * `rootId` plus every descendant, depth-first.
 *
 * Returns an empty array when `rootId` is not in `rows` — that is the correct
 * answer for a category id belonging to another organization, and it makes the
 * caller return zero rows rather than raising.
 *
 * Cycles cannot occur through the UI, but `parent_group_id` is a self-referencing
 * FK with no constraint preventing one, and a cycle here would hang the request.
 * The visited set makes that impossible rather than unlikely.
 */
export function collectCategorySubtreeIds(
  rootId: string,
  rows: readonly CategoryTreeRow[],
): string[] {
  if (!rows.some((r) => r.id === rootId)) return [];

  const children = indexChildren(rows);
  const visited = new Set<string>();
  const stack: string[] = [rootId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const child of children.get(id) ?? []) stack.push(child.id);
  }
  return [...visited];
}
