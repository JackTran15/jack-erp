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
export interface InStockSqlParams {
  /** SQL expression for the item id, e.g. `ai.id`. */
  itemIdExpr: string;
  /** Placeholder holding the organization id, e.g. `$1`. */
  orgParam: string;
  /**
   * Placeholder holding the branch ids the caller may see, e.g. `$3`.
   * Omit to count stock across the whole organization.
   */
  branchParam?: string;
}

/**
 * `branch_id` is a varchar on `stock_balances`, not a uuid, so the array cast
 * has to be `varchar[]`; casting to `uuid[]` fails at runtime with a type
 * mismatch that only shows up once a branch filter is actually supplied.
 */
export function inStockExistsSql({
  itemIdExpr,
  orgParam,
  branchParam,
}: InStockSqlParams): string {
  const branchClause = branchParam
    ? `AND sb.branch_id = ANY(${branchParam}::varchar[])`
    : '';
  return `EXISTS (
    SELECT 1 FROM stock_balances sb
    WHERE sb.item_id = ${itemIdExpr}
      AND sb.organization_id = ${orgParam}
      AND sb.quantity > 0
      ${branchClause}
  )`;
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
