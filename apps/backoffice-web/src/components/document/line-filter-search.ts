/**
 * Turning the line grid's header filters into a `lines/search` request body.
 *
 * Shared by the goods-issue and goods-receipt view dialogs: both grids expose the
 * same five server-filterable columns and both endpoints take the same DTO shape,
 * so the mapping has exactly one definition and one set of tests.
 */

/**
 * Numeric DTO fields — the header shows `≤` for these and that is the rule that runs.
 *
 * Keyed on the DTO field, not on the grid column key, because the two grids do not
 * agree on the key: the receipt grid calls its quantity column `orderedQuantity`
 * while the issue grid calls it `quantity`. Both map to the DTO's `quantity`, so
 * the field is the thing that is actually common.
 */
const NUMERIC_FILTER_FIELDS = new Set(["quantity", "unitPrice", "lineTotal"]);

/**
 * vi-VN number text to a number, or null when it is not (yet) one.
 *
 * Mirrors `parseVnNumber` in the grid: a half-typed limit ("1," or "-") must not
 * blank the grid, so it is left out of the request entirely rather than sent as
 * garbage.
 */
export function parseVnNumberInput(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Header filters to a search body. Numeric columns carry the `≤` the header
 * shows; the rest are substring matches, which is what `*` means there.
 */
export function buildLineSearchBody(
  filters: Record<string, string>,
  /** Grid column key → DTO field. Columns absent from this map are ignored. */
  fieldByColumn: Record<string, string>,
  page: number,
  limit: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = { page, limit };
  for (const [key, raw] of Object.entries(filters)) {
    const field = fieldByColumn[key];
    if (!field || !raw.trim()) continue;
    if (NUMERIC_FILTER_FIELDS.has(field)) {
      const value = parseVnNumberInput(raw);
      if (value == null) continue;
      body[field] = { operator: "<=", value };
    } else {
      body[field] = { operator: "*", value: raw.trim() };
    }
  }
  return body;
}

export { NUMERIC_FILTER_FIELDS };
