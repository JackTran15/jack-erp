export interface TimeOfDay {
  hours: number;
  minutes: number;
}

function toMinutes(time: TimeOfDay): number {
  return time.hours * 60 + time.minutes;
}

/**
 * A start/end time-of-day window within a single day. `end < start` means the
 * window spans midnight (e.g. 22:00-02:00) rather than being invalid. Either
 * bound may be omitted, giving a half-open window — see `contains`.
 */
export class TimeWindow {
  private constructor(
    private readonly start?: TimeOfDay,
    private readonly end?: TimeOfDay,
  ) {}

  static of(start?: TimeOfDay, end?: TimeOfDay): TimeWindow {
    return new TimeWindow(start, end);
  }

  /**
   * Each bound constrains independently, like the sibling DateWindow: a start
   * on its own means "from then until end of day", an end on its own means
   * "from start of day until then". Only when both are missing is the window
   * open all day.
   *
   * Treating a half-filled window as always-open (the previous behaviour) made
   * a programme set to start at 18:00 discount a 09:00 sale.
   */
  contains(at: TimeOfDay): boolean {
    if (!this.start && !this.end) return true;
    const target = toMinutes(at);
    if (!this.end) return target >= toMinutes(this.start!);
    if (!this.start) return target <= toMinutes(this.end);
    const start = toMinutes(this.start);
    const end = toMinutes(this.end);
    return start <= end
      ? target >= start && target <= end
      : // end < start = the window spans midnight (e.g. 22:00-02:00)
        target >= start || target <= end;
  }

  static timeOfDayFromDate(date: Date): TimeOfDay {
    return { hours: date.getHours(), minutes: date.getMinutes() };
  }

  /** Parses "HH:mm" or "HH:mm:ss" (DTO wire format and Postgres `time` read-back both fit). */
  static parse(value?: string | null): TimeOfDay | undefined {
    if (!value) return undefined;
    const [hours, minutes] = value.split(':').map(Number);
    return { hours, minutes };
  }
}
