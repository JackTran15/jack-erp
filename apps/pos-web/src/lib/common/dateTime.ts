const viDateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const viDateTimeWithSecondsFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function partsOf(d: Date): Intl.DateTimeFormatPart[] {
  return viDateTimeFormatter.formatToParts(d);
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

export interface FormatViDateTimeOptions {
  separator?: "dash" | "space";
  withSeconds?: boolean;
}

export function formatViDateTime(
  input: Date | string,
  options: FormatViDateTimeOptions = {},
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    return typeof input === "string" ? input : "";
  }
  const { separator = "dash", withSeconds = false } = options;
  if (withSeconds) return viDateTimeWithSecondsFormatter.format(d).replace(",", "");
  const parts = partsOf(d);
  const separatorValue = separator === "space" ? " " : " - ";
  return `${part(parts, "day")}/${part(parts, "month")}/${part(parts, "year")}${separatorValue}${part(parts, "hour")}:${part(parts, "minute")}`;
}

/**
 * Parse a Vietnamese-style `dd/MM/yyyy` date string (tolerant of `d/M/yyyy`)
 * into a local `Date` at midnight. Returns `null` for anything that is not a
 * valid calendar date — callers treat `null` as "no filter".
 */
export function parseViDate(input: string): Date | null {
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}
