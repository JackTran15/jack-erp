export interface TimeOfDay {
  hours: number;
  minutes: number;
}

function toMinutes(time: TimeOfDay): number {
  return time.hours * 60 + time.minutes;
}

/**
 * A start/end time-of-day window within a single day. `end < start` means the
 * window spans midnight (e.g. 22:00-02:00) rather than being invalid.
 */
export class TimeWindow {
  private constructor(
    private readonly start?: TimeOfDay,
    private readonly end?: TimeOfDay,
  ) {}

  static of(start?: TimeOfDay, end?: TimeOfDay): TimeWindow {
    return new TimeWindow(start, end);
  }

  /** Either bound missing = open all day. */
  contains(at: TimeOfDay): boolean {
    if (!this.start || !this.end) return true;
    const start = toMinutes(this.start);
    const end = toMinutes(this.end);
    const target = toMinutes(at);
    return start <= end
      ? target >= start && target <= end
      : target >= start || target <= end;
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
