import {
  DEFAULT_PARTNER_PRODUCT_SORT,
  PartnerProductSort,
} from './dto/partner-product-search.dto';

/**
 * `sort` value -> ORDER BY clause.
 *
 * A closed lookup table rather than string interpolation. `sort` arrives from
 * an untrusted body, and building an ORDER BY by concatenation is the textbook
 * way to reopen SQL injection on an endpoint that is otherwise fully
 * parameterised — parameters cannot bind an identifier, so this is exactly the
 * spot where care is required.
 *
 * Every clause ends with `a.id ASC`. Without a unique tiebreak, two products at
 * the same price have no defined order between two queries, so paging through
 * a 107-row result can show one row twice and skip another — and it looks like
 * a data bug, not a sorting bug.
 */
const ORDER_BY: Readonly<Record<PartnerProductSort, string>> = {
  newest: 'a.created_at DESC, a.id ASC',
  price_asc: 'a."priceMin" ASC, a.id ASC',
  price_desc: 'a."priceMax" DESC, a.id ASC',
};

/**
 * Resolves the ORDER BY clause for a sort key.
 *
 * `undefined` means "not supplied" and yields the default. Anything else that
 * is not a published key throws: the DTO already rejects those at the HTTP
 * edge, and a second check here means an internal caller cannot silently get
 * an order it did not ask for.
 */
export function resolveProductOrderBy(sort?: PartnerProductSort): string {
  const key = sort ?? DEFAULT_PARTNER_PRODUCT_SORT;
  const clause = ORDER_BY[key];
  if (!clause) {
    throw new Error(`Unsupported partner product sort: ${String(key)}`);
  }
  return clause;
}
