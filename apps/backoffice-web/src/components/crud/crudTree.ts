/**
 * Registry of admin entityKeys whose list renders as a collapsible parent →
 * child tree instead of the flat paginated table. Each one has a backend
 * endpoint that returns the whole nested tree in one response (no page cap),
 * so `CrudListPage` can flatten, indent and collapse it client-side.
 *
 * Any entityKey NOT listed here keeps the generic list behaviour.
 */
export interface CrudTreeConfig {
  /** Tree endpoint — a POST with a JSON body, typed against the api-client. */
  path: "/v2/inventory/item-categories/tree" | "/v2/cash-voucher-categories/tree";
  /**
   * TanStack Query key prefix. Mutations invalidate on it, and other screens
   * may rely on the same prefix (`ItemCategoriesPage` invalidates
   * `["item-category-tree"]` after an Excel import), so never rename one.
   */
  queryKey: string;
  /** Column filters whose text becomes `body.search` (first non-empty wins). */
  searchKeys: string[];
  /**
   * Column filters passed through to the body under their own key. Select
   * filters hand over their option value as a string; `"true"`/`"false"`
   * become booleans.
   */
  filterKeys: string[];
}

export const CRUD_TREE_ENTITIES: Record<string, CrudTreeConfig> = {
  "inventory-item-categories": {
    path: "/v2/inventory/item-categories/tree",
    queryKey: "item-category-tree",
    searchKeys: ["name", "code"],
    filterKeys: [],
  },
  "cash-voucher-categories": {
    path: "/v2/cash-voucher-categories/tree",
    queryKey: "cash-voucher-category-tree",
    searchKeys: ["name", "code"],
    filterKeys: ["direction", "isActive"],
  },
};

/** Minimal shape every tree endpoint's node shares. */
export interface CrudTreeNode {
  id: string;
  children: CrudTreeNode[];
  [key: string]: unknown;
}

export interface CrudTreeResponse {
  data: CrudTreeNode[];
}

/**
 * Body for a tree request, built from the active column filters. Keys are
 * only added when they carry a value, so an entity with no filters sends
 * `{}` and an untouched filter row never changes the query key.
 */
export function buildTreeBody(
  config: CrudTreeConfig,
  columnFilters: Record<string, { value: string } | undefined>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const search = config.searchKeys
    .map((key) => columnFilters[key]?.value?.trim() ?? "")
    .find((value) => value.length > 0);
  if (search) body.search = search;
  for (const key of config.filterKeys) {
    const value = columnFilters[key]?.value?.trim();
    if (!value) continue;
    body[key] = value === "true" ? true : value === "false" ? false : value;
  }
  return body;
}
