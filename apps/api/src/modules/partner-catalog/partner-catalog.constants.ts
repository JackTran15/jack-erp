/**
 * Shared constants for the partner-facing read surface.
 *
 * Kept in one file because two things here are load-bearing and easy to get
 * wrong if they are re-typed at each call site:
 *
 * 1. The permission key. The whole point of this module is that a partner API
 *    key carries ONLY this permission, so it cannot reach the internal
 *    inventory endpoints that expose purchase price. A typo here silently
 *    widens or breaks that boundary.
 * 2. The attribute dimension names. `product_attribute_definitions` is
 *    per-product with a free-text `name` — there is no master table — so
 *    "Color"/"Size" are conventions, not guarantees. Matching must be
 *    case-insensitive, and adding an alias later must be a one-file change.
 */

/** The only permission the partner surface requires. */
export const PARTNER_CATALOG_PERMISSION = 'partner.catalog.read';

/** Attribute dimension holding the colour code (raw ERP code, not a name). */
export const ATTRIBUTE_COLOR = 'Color';

/** Attribute dimension holding the size value. */
export const ATTRIBUTE_SIZE = 'Size';

/**
 * Accepted spellings per dimension, lower-cased. Organisations type these by
 * hand, so a Vietnamese-named catalogue must still match.
 */
export const ATTRIBUTE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  [ATTRIBUTE_COLOR]: ['color', 'colour', 'mau', 'mau sac', 'màu', 'màu sắc'],
  [ATTRIBUTE_SIZE]: ['size', 'kich thuoc', 'kích thước', 'co', 'cỡ'],
};

/** True when a stored attribute definition name denotes `dimension`. */
export function matchesAttributeDimension(
  definitionName: string,
  dimension: string,
): boolean {
  const needle = definitionName.trim().toLowerCase();
  const aliases = ATTRIBUTE_ALIASES[dimension] ?? [dimension.toLowerCase()];
  return aliases.includes(needle);
}
