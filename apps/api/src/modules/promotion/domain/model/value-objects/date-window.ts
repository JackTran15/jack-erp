function toDayIndex(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * A start/end calendar-day window; time-of-day is ignored on all three inputs.
 * Either bound missing = unbounded on that side; both missing = always open.
 */
export class DateWindow {
  private constructor(
    private readonly start?: Date,
    private readonly end?: Date,
  ) {}

  static of(start?: Date, end?: Date): DateWindow {
    return new DateWindow(start, end);
  }

  contains(date: Date): boolean {
    const target = toDayIndex(date);
    if (this.start && target < toDayIndex(this.start)) return false;
    if (this.end && target > toDayIndex(this.end)) return false;
    return true;
  }
}
