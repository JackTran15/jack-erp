import { describe, it, expect, afterAll } from "vitest";
import { formatViDateTime } from "./dateTime";

describe("formatViDateTime — timezone independence", () => {
  const originalTz = process.env.TZ;
  process.env.TZ = "America/New_York"; // arbitrary non-Vietnam zone

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  // 2026-01-01T00:00:00Z is 2026-01-01T07:00:00+07:00 in Asia/Ho_Chi_Minh —
  // a value that would print a different calendar day under most other zones.
  const instant = new Date("2026-01-01T00:00:00Z");

  it("formats with the default dash separator, regardless of TZ", () => {
    expect(formatViDateTime(instant)).toBe("01/01/2026 - 07:00");
  });

  it('formats with separator: "space", regardless of TZ', () => {
    expect(formatViDateTime(instant, { separator: "space" })).toBe(
      "01/01/2026 07:00",
    );
  });

  it("formats with withSeconds: true, regardless of TZ", () => {
    expect(formatViDateTime(instant, { withSeconds: true })).toBe(
      "07:00:00 01/01/2026",
    );
  });

  it("returns the raw input string for invalid string input", () => {
    expect(formatViDateTime("not-a-date")).toBe("not-a-date");
  });
});
