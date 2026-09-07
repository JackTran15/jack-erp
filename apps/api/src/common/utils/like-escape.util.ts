/**
 * Escape a user-typed term before it goes into a `LIKE` / `ILIKE` pattern.
 *
 * Without this, `%` and `_` keep their wildcard meaning and a search box turns
 * into a pattern language the user never asked for: typing `%` matches every
 * row, typing `_` matches every single character. Both are things people type
 * for real — a product code like `50%_off`, or just a stray keystroke.
 *
 * Postgres' default ESCAPE for LIKE/ILIKE is the backslash, so the caller needs
 * no `ESCAPE` clause. The backslash itself is escaped first (the regex handles
 * all three in one pass, so `\` cannot be double-processed).
 *
 * The caller still adds its own `%` around the result — this only neutralises
 * what came from the user:
 *
 * ```ts
 * qb.andWhere('x ILIKE :q', { q: `%${escapeLikeTerm(term)}%` });
 * ```
 */
export const escapeLikeTerm = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);
