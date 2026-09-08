/**
 * SQL fragment builders for the POS branch catalogue lookups.
 *
 * These return SQL text and nothing else — no DataSource, no Nest DI, no
 * TypeORM — so the *shape* of the query can be asserted without a database,
 * and so the exact-match arm cannot drift between
 * `PosCatalogService.lookupByCode` and the CQRS search handler.
 */

export interface ExactMatchCteParams {
  /** Placeholder bound to the organization id, e.g. `'$1'`. */
  org: string;
  /** Placeholder bound to the code being matched exactly, e.g. `'$3'`. */
  code: string;
}

/**
 * Item ids whose SKU (`items.code`) OR an attached barcode (`item_barcodes.code`)
 * equals `code` exactly, scoped to `org` and limited to active + POS-visible items.
 *
 * Written as a UNION of two independently indexable arms rather than the more
 * obvious `LEFT JOIN item_barcodes ... WHERE i.code = $3 OR b.code = $3`.
 * An OR spanning a joined table cannot be pushed into either unique index, so
 * that form makes Postgres scan both tables in full: measured on a production
 * restore (21,024 POS-visible items, 41,714 barcodes) it costs 25.3 ms with
 * `Seq Scan on items` + `Seq Scan on item_barcodes`.
 *
 * Rewriting the barcode arm as `OR EXISTS (SELECT 1 FROM item_barcodes ...)` is
 * worse still, not better: the planner bitmap-scans every POS-visible item and
 * runs the subplan as a per-row filter. Only the UNION lets each arm pick its
 * own index — `UQ_72337e6413e97c8b8fc2e1aaabf` and `UQ_item_barcodes_org_code` —
 * which brings the same query to 1.1 ms without adding any index.
 *
 * The union also de-duplicates by item id, so an item whose barcode equals its
 * own SKU yields one row rather than two.
 */
export function buildExactMatchCte({ org, code }: ExactMatchCteParams): string {
  return `SELECT i.id
            FROM items i
           WHERE i.organization_id = ${org}
             AND i.code = ${code}
             AND i.is_active = true
             AND i.is_pos_visible = true
           UNION
          SELECT i.id
            FROM items i
            JOIN item_barcodes b
              ON b.item_id = i.id
             AND b.organization_id = i.organization_id
           WHERE b.organization_id = ${org}
             AND b.code = ${code}
             AND i.is_active = true
             AND i.is_pos_visible = true`;
}

export interface SuggestCteParams {
  /** Placeholder bound to the organization id, e.g. `'$1'`. */
  org: string;
  /** Placeholder bound to the ILIKE pattern (already wrapped in `%`), e.g. `'$3'`. */
  pattern: string;
  /**
   * Row cap applied to the matched items, before any stock join. Omit to keep
   * the historical unbounded behaviour of `GET /pos/branches/:id/catalog`.
   */
  limit?: number;
}

/**
 * Item ids whose name/SKU, an attached barcode, or the parent product's
 * code/name matches `pattern`, scoped to `org` and limited to active +
 * POS-visible items.
 *
 * Three UNIONed arms, for the same reason `buildExactMatchCte` has two: an OR
 * that spans a joined table cannot be pushed into an index. Measured on a
 * production restore (21,024 POS-visible items, 41,714 barcodes, 4,731
 * products), pattern `%235%`:
 *
 *   - current shape, four ILIKEs ORed across a LEFT JOIN, unbounded ... 88.3 ms
 *   - the same predicate rewritten as `OR EXISTS (...)` ................ 98.8 ms
 *   - three UNIONed arms, LIMIT 20, before IDX_item_barcodes_code_trgm .. 18.5 ms
 *   - three UNIONed arms, LIMIT 20, after it ........................... 4.6 ms
 *
 * The EXISTS form is the trap: it reads like the obvious fix and is slower than
 * what it replaces, because the planner bitmap-scans every POS-visible item and
 * runs the subplans as per-row filters instead of touching a trigram index.
 *
 * Note that pg_trgm needs three characters to form a trigram, so a one- or
 * two-character pattern falls back to scanning whatever the arms' other
 * predicates select (54.7 ms for `%2%`, even with the LIMIT). Callers that face
 * a human typing into a box are expected to hold the request until the term is
 * long enough; this builder cannot do it for them.
 *
 * The LIMIT deliberately lands here, on the matched items, rather than on the
 * final result: applying it after the stock join would first fan every item out
 * into one row per storage location and then cut through the middle of one
 * item's locations.
 */
export function buildSuggestCte({
  org,
  pattern,
  limit,
}: SuggestCteParams): string {
  const arms = `SELECT i.id, i.name
                  FROM items i
                 WHERE i.organization_id = ${org}
                   AND i.is_active = true
                   AND i.is_pos_visible = true
                   AND (i.name ILIKE ${pattern} OR i.code ILIKE ${pattern})
                 UNION
                SELECT i.id, i.name
                  FROM items i
                  JOIN item_barcodes b
                    ON b.item_id = i.id
                   AND b.organization_id = i.organization_id
                 WHERE b.organization_id = ${org}
                   AND b.code ILIKE ${pattern}
                   AND i.is_active = true
                   AND i.is_pos_visible = true
                 UNION
                SELECT i.id, i.name
                  FROM items i
                  JOIN products p
                    ON p.id = i.product_id
                   AND p.organization_id = i.organization_id
                 WHERE p.organization_id = ${org}
                   AND (p.code ILIKE ${pattern} OR p.name ILIKE ${pattern})
                   AND i.is_active = true
                   AND i.is_pos_visible = true`;

  if (limit === undefined) {
    return `SELECT u.id FROM (${arms}) u`;
  }

  // Ordered by name so the cap keeps a stable, meaningful slice rather than
  // whichever rows the union happened to emit first. The caller re-sorts the
  // surviving rows with a Vietnamese collation; this ordering only decides
  // which rows survive.
  return `SELECT u.id FROM (${arms}) u ORDER BY u.name ASC LIMIT ${limit}`;
}

export interface ItemIdsCteParams {
  /** Placeholder bound to the organization id, e.g. `'$1'`. */
  org: string;
  /**
   * Placeholder bound to the item id array, e.g. `'$3'`. Bound as a single
   * array parameter and compared with `= ANY(...)` — never interpolated, since
   * unlike the other two builders this one is driven by caller-supplied values.
   */
  itemIds: string;
}

/**
 * The subset of `itemIds` that are still sellable at this organization.
 *
 * Filtering on `is_active` / `is_pos_visible` here means an item withdrawn from
 * sale mid-session simply drops out of the result. The caller sees fewer rows
 * than it asked for, which is the honest answer: the cart line keeps its
 * unknown on-hand and the oversell warning stays on, rather than being told a
 * stale quantity.
 */
export function buildItemIdsCte({ org, itemIds }: ItemIdsCteParams): string {
  return `SELECT i.id
            FROM items i
           WHERE i.organization_id = ${org}
             AND i.id = ANY(${itemIds}::uuid[])
             AND i.is_active = true
             AND i.is_pos_visible = true`;
}
