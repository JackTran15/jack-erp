import { defaults, types } from 'pg';

/**
 * `timestamp without time zone` columns in this schema hold UTC, not business
 * wall clock. Two independent things say so: report SQL renders them as
 * `col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'`, and every row
 * written by a transaction that also touched a `timestamptz` column lines up
 * to the millisecond with it — e.g. on `stock_ledger_entries`, the naive
 * `created_at` equals `posted_at AT TIME ZONE 'UTC'`.
 *
 * node-postgres does not honour that convention on its own. It converts naive
 * columns in the *process* timezone, in both directions:
 *
 *   - reading, pg-types builds the Date from local components, so a UTC value
 *     read on a UTC+7 host comes back seven hours early;
 *   - writing, a Date param is serialised with the host's offset and Postgres
 *     drops that offset when the target column is naive, storing wall clock.
 *
 * The two cancel out on a UTC host, which is why the round trip looked fine
 * for as long as nothing else read those columns. They do not cancel out
 * anywhere else, and anything that reads a naive column in SQL rather than
 * through the driver (every report) sees the raw skew.
 *
 * Pinning both directions to UTC makes the convention hold on any host. The
 * matching half of the pin is the session `TimeZone` GUC (`data-source.ts`,
 * `app.module.ts`), which is what `DEFAULT now()` casts through when Postgres
 * itself fills a naive column.
 */
export function applyUtcTimestampCodec(): void {
  // Outbound: serialise Date params as `...Z` rather than the host's offset.
  defaults.parseInputDatesAsUTC = true;

  // Inbound: read `timestamp without time zone` as UTC, not process-local.
  // Postgres hands it over as `YYYY-MM-DD HH:MI:SS[.ffffff]`.
  types.setTypeParser(
    types.builtins.TIMESTAMP,
    (value: string) => new Date(`${value.replace(' ', 'T')}Z`),
  );
}
