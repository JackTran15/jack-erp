describe('AppDataSource — timezone pin', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    // Force a non-Vietnam TZ before the module under test is imported, so the
    // assertion is meaningfully independent of the host's real TZ, not just
    // coincidentally correct on this machine.
    process.env.TZ = 'Asia/Ho_Chi_Minh';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('pins the Postgres session timezone to UTC regardless of process.env.TZ', () => {
    // Imported inside the test (after TZ is forced) rather than at module top,
    // since `AppDataSource` is a `new DataSource({...})` literal evaluated at
    // import time.
    const { AppDataSource } = require('./data-source');

    // Postgres has no top-level `timezone` DataSource option in TypeORM (that's
    // mysql2-only) — the pin lives in `extra.options`, which TypeORM merges
    // verbatim into the pg.Pool config as a libpq startup parameter.
    //
    // UTC, not the business zone: this GUC is what `DEFAULT now()` casts
    // through when Postgres fills a `timestamp without time zone` column, and
    // the whole app reads those columns as UTC.
    expect(AppDataSource.options.extra?.options).toBe('-c timezone=UTC');
  });
});
