import {
  businessDayEnd,
  businessDayEndExclusive,
  businessDayStart,
  isCalendarDate,
  toBusinessDate,
  toBusinessTime,
} from './business-timezone.util';

describe('business-timezone.util', () => {
  it('reads an instant as the local date and time it was issued at', () => {
    // 13:27 UTC is 20:27 the same evening in Ho Chi Minh City.
    const at = new Date('2026-08-19T13:27:06.698Z');
    expect(toBusinessDate(at)).toBe('2026-08-19');
    expect(toBusinessTime(at)).toBe('20:27');
  });

  it('keeps a late-evening instant on the local day, not the next UTC one', () => {
    // 19:00 UTC has already rolled over to 02:00 the next morning locally.
    const at = new Date('2026-08-19T19:00:00.000Z');
    expect(toBusinessDate(at)).toBe('2026-08-20');
    expect(toBusinessTime(at)).toBe('02:00');
  });

  it('opens and closes a local day at the right UTC instants', () => {
    expect(businessDayStart('2026-08-19')).toBe('2026-08-18T17:00:00.000Z');
    expect(businessDayEnd('2026-08-19')).toBe('2026-08-19T16:59:59.999Z');
    expect(businessDayEndExclusive('2026-08-19')).toBe('2026-08-19T17:00:00.000Z');
  });

  it('rolls a month end over correctly', () => {
    expect(businessDayEndExclusive('2026-08-31')).toBe('2026-08-31T17:00:00.000Z');
    expect(businessDayStart('2026-09-01')).toBe('2026-08-31T17:00:00.000Z');
  });

  it('tells a bare calendar date apart from a full timestamp', () => {
    expect(isCalendarDate('2026-08-19')).toBe(true);
    expect(isCalendarDate('2026-08-19T13:27:06.698Z')).toBe(false);
  });
});
