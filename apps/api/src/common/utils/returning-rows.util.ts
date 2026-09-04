/**
 * Reading the result of a raw `… RETURNING` query.
 *
 * TypeORM's postgres driver hands back two different shapes from the same
 * `manager.query()` call, decided by the SQL command
 * (`driver/postgres/PostgresQueryRunner.js`, the `switch (raw.command)`):
 *
 * ```
 * SELECT …                        → [{…}, {…}]       a row array
 * INSERT … RETURNING              → [{…}]            a row array
 * UPDATE/DELETE … RETURNING       → [rows, rowCount] a TWO-ELEMENT array
 * ```
 *
 * So `result.length` on an UPDATE or DELETE is always 2, whether it matched
 * a thousand rows or none. That is not a hypothetical: it is how the
 * transfer-order import fix of 2026-08-24 became dead code —
 * `if (updated.length > 0) continue;` never let the insert branch run, and the
 * bug it was written to stop kept happening for another ten days with a green
 * unit test standing over it. See ADR-01 in
 * `.ai/features/2026090301-transfer-import-line-mismatch/03-logical-design.md`.
 *
 * Read every RETURNING result through these two helpers instead of indexing or
 * measuring the raw value. `returning-rows.util.spec.ts` locks the parsing;
 * `test/e2e/typeorm-returning-shape.e2e-spec.ts` proves against a live Postgres
 * that these are the shapes the driver really produces — the shape is measured,
 * never assumed.
 */

/** True for the `[rows, rowCount]` wrapper an UPDATE/DELETE comes back in. */
function isAffectedResult(result: unknown): result is [unknown[], number] {
  // Keyed on "first element is itself an array", not on length === 2: a SELECT
  // that happens to return exactly two rows also has length 2.
  return Array.isArray(result) && Array.isArray(result[0]);
}

/** The rows a `… RETURNING` query returned, whatever command produced them. */
export function returnedRows<T>(result: unknown): T[] {
  if (isAffectedResult(result)) return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

/**
 * How many rows the statement actually touched. For UPDATE/DELETE this is the
 * driver's own `rowCount`; for a row array it is the number of rows.
 */
export function affectedRowCount(result: unknown): number {
  if (isAffectedResult(result)) {
    const [rows, rowCount] = result;
    return typeof rowCount === 'number' ? rowCount : rows.length;
  }
  return Array.isArray(result) ? result.length : 0;
}
