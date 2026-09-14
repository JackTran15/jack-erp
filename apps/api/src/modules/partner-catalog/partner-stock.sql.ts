/**
 * The one definition of "in stock" for the partner surface.
 *
 * Shared by the product listing (rolled up with `bool_or` across a product's
 * variants) and the product detail (per variant). Two copies of this predicate
 * would eventually disagree, and a listing that says "in stock" next to a
 * detail page that says otherwise is worse than either answer alone.
 *
 * Deliberately a boolean, never a quantity: exposing exact stock levels to a
 * third party leaks commercial information, and the number would be stale the
 * moment it left the server (ADR-06).
 */
export interface StockScopeParams {
  /** Placeholder holding the organization id, e.g. `$1`. */
  orgParam: string;
  /**
   * Placeholder holding the branch ids the caller may see, e.g. `$3`.
   * Omit to count stock across the whole organization.
   */
  branchParam?: string;
}

export interface InStockSqlParams extends StockScopeParams {
  /** SQL expression for the item id, e.g. `ai.id`. */
  itemIdExpr: string;
}

/**
 * The conditions that make a `stock_balances` row count as stock. Both shapes
 * below are built from this, so they cannot drift apart.
 *
 * `branch_id` is a varchar on `stock_balances`, not a uuid, so the array cast
 * has to be `varchar[]`; casting to `uuid[]` fails at runtime with a type
 * mismatch that only shows up once a branch filter is actually supplied.
 */
function stockRowConditions({ orgParam, branchParam }: StockScopeParams): string {
  const branchClause = branchParam
    ? `AND sb.branch_id = ANY(${branchParam}::varchar[])`
    : '';
  return `sb.organization_id = ${orgParam}
      AND sb.quantity > 0
      ${branchClause}`;
}

/** Per-item form, for a query that reads the flag once per row (the detail). */
export function inStockExistsSql({
  itemIdExpr,
  orgParam,
  branchParam,
}: InStockSqlParams): string {
  return `EXISTS (
    SELECT 1 FROM stock_balances sb
    WHERE sb.item_id = ${itemIdExpr}
      AND ${stockRowConditions({ orgParam, branchParam })}
  )`;
}

/**
 * Set form: the id of every item that has stock, once each — for joining.
 *
 * Use this where the flag is read more than once per row. Postgres inlines a
 * CTE that is referenced once, so an `in_stock` column defined as an EXISTS is
 * re-evaluated at every place the column is read: on erp_dev_3008 (2026-09-13)
 * the listing with `inStock=true` scanned `stock_balances` six times and took
 * 654 ms, against 34 ms when the flag came from a `LEFT JOIN` on this set.
 * DISTINCT because an item holds one balance row per location.
 */
export function stockedItemIdsSql(scope: StockScopeParams): string {
  return `SELECT DISTINCT sb.item_id FROM stock_balances sb
    WHERE ${stockRowConditions(scope)}`;
}

/**
 * The branch list to scope stock by, or `undefined` for organization-wide.
 *
 * An API key with `branch_ids = NULL` means "every branch", and
 * `ApiKeyAuthService` has already expanded that into the full list before the
 * request reaches a handler. An EMPTY list is the case worth care: passing it
 * through would produce `= ANY('{}')`, which matches nothing and would report
 * the entire catalogue as out of stock — a wrong answer that looks like data.
 * Treat it as unscoped instead, since this surface is organization-wide by
 * design and the organization filter still applies.
 */
export function resolveStockBranchIds(
  branchIds: string[] | undefined,
): string[] | undefined {
  return branchIds && branchIds.length > 0 ? branchIds : undefined;
}
