import { describe, it, expect, afterAll } from "vitest";
import { formatViDate, formatViDateTime } from "./date-time-format";

describe("formatViDateTime / formatViDate — timezone independence", () => {
  const originalTz = process.env.TZ;
  process.env.TZ = "America/New_York"; // arbitrary non-Vietnam zone

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("formats a fixed UTC instant as Asia/Ho_Chi_Minh wall-clock time regardless of TZ", () => {
    // 2026-01-01T00:00:00Z is 2026-01-01T07:00:00+07:00 in Asia/Ho_Chi_Minh —
    // a value that would print a different calendar day under most other zones.
    const instant = new Date("2026-01-01T00:00:00Z");
    expect(formatViDateTime(instant)).toBe("01/01/2026 07:00");
    expect(formatViDate(instant)).toBe("01/01/2026");
  });

  it("includes seconds when withSeconds: true", () => {
    const instant = new Date("2026-01-01T00:00:00Z");
    expect(formatViDateTime(instant, { withSeconds: true })).toBe(
      "01/01/2026 07:00:00",
    );
  });

  it('returns "" for invalid input', () => {
    expect(formatViDateTime("not-a-date")).toBe("");
    expect(formatViDate("not-a-date")).toBe("");
  });
});
