/**
 * The business calendar timezone: Asia/Ho_Chi_Minh.
 *
 * Every operational date a user reads or types — the date column on an invoice
 * report, the from/to of a period filter — is a wall-clock date in that zone,
 * while `timestamptz` columns hold the UTC instant. Reading the instant as if
 * it already were local (`toISOString().slice(0, 10)`) shifts every value back
 * seven hours and rolls anything issued before 07:00 into the previous day;
 * binding a bare `YYYY-MM-DD` against a `timestamptz` does the same to the ends
 * of a filter window, because the connection runs in UTC.
 *
 * Vietnam has kept a fixed +07:00 offset with no DST since 1975, so a constant
 * offset is exact here and costs nothing per row, unlike an `Intl` formatter.
 */
const OFFSET_MS = 7 * 60 * 60 * 1000;

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar date (`YYYY-MM-DD`) the instant falls on, in business time. */
export function toBusinessDate(value: Date): string {
  return new Date(value.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** The wall-clock time (`HH:mm`) the instant reads as, in business time. */
export function toBusinessTime(value: Date): string {
  return new Date(value.getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

/** True when the bound is a bare calendar date rather than a full timestamp. */
export function isCalendarDate(value: string): boolean {
  return CALENDAR_DATE.test(value);
}

/** The instant `YYYY-MM-DD` opens on, as UTC ISO. */
export function businessDayStart(date: string): string {
  return new Date(`${date}T00:00:00.000+07:00`).toISOString();
}

/**
 * The last instant of `YYYY-MM-DD` in business time, as UTC ISO — the
 * inclusive end of a period the user picked by day.
 */
export function businessDayEnd(date: string): string {
  return new Date(nextDayStartMs(date) - 1).toISOString();
}

/**
 * The instant the day *after* `YYYY-MM-DD` opens on, as UTC ISO — the exclusive
 * upper bound to compare a `timestamptz` against.
 */
export function businessDayEndExclusive(date: string): string {
  return new Date(nextDayStartMs(date)).toISOString();
}

function nextDayStartMs(date: string): number {
  const start = new Date(`${date}T00:00:00.000+07:00`);
  start.setUTCDate(start.getUTCDate() + 1);
  return start.getTime();
}
