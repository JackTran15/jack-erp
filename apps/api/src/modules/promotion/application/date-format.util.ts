/**
 * Formats a `date`/`timestamptz` value's LOCAL calendar day as 'YYYY-MM-DD'.
 *
 * Accepts both shapes seen in this module: a real `Date` (from a domain
 * object hydrated via promotion.mapper.ts's toDomainDate, or a timestamptz
 * column, which TypeORM does return as a Date) and a raw `'YYYY-MM-DD'`
 * string (a `date`-type column read directly off a TypeORM entity, e.g. in
 * toSummary() — TypeORM returns those as plain strings despite the entity's
 * `Date` type annotation, and that string is already the exact wire format).
 *
 * Deliberately not `.toISOString().slice(0, 10)` (UTC-based) for the Date
 * case — dates sourced from a `date`-type column are parsed via local
 * components, so formatting them back via UTC getters shifts the calendar
 * day by one in positive-UTC-offset timezones (e.g. Asia/Saigon, UTC+7).
 */
export function toIsoDate(value?: Date | string | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
