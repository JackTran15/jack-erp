import { defaults, types } from 'pg';
import { applyUtcTimestampCodec } from './utc-timestamp-codec';

/**
 * The regression these lock down: on a UTC+7 host the driver used to read a
 * naive column as local, so a row stored as 11:47 UTC came back as 04:47 UTC
 * and rendered as 11:47 in the UI instead of 18:47.
 */
describe('applyUtcTimestampCodec', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Asia/Ho_Chi_Minh';
    applyUtcTimestampCodec();
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('reads `timestamp without time zone` as UTC, not as host-local', () => {
    const parse = types.getTypeParser(types.builtins.TIMESTAMP) as (
      value: string,
    ) => Date;

    expect(parse('2026-08-20 11:47:14.253791').toISOString()).toBe(
      '2026-08-20T11:47:14.253Z',
    );
  });

  it('keeps a whole-second value exact', () => {
    const parse = types.getTypeParser(types.builtins.TIMESTAMP) as (
      value: string,
    ) => Date;

    expect(parse('2026-08-19 13:27:06').toISOString()).toBe(
      '2026-08-19T13:27:06.000Z',
    );
  });

  it('writes Date params as UTC so naive columns receive UTC', () => {
    expect(defaults.parseInputDatesAsUTC).toBe(true);
  });
});
