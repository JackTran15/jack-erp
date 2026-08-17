import { formatViDateTime as formatViDateTimeShared } from "@erp/ui";

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

  // The shared util always outputs "dd/MM/yyyy HH:mm[:ss]" (date first, one
  // space, Asia/Ho_Chi_Minh-pinned). Reassemble into this module's own
  // historical shapes below so no existing caller's visible output changes —
  // only the underlying Intl.DateTimeFormat construction (now TZ-safe).
  const shared = formatViDateTimeShared(d, { withSeconds });
  const spaceIdx = shared.indexOf(" ");
  const datePart = shared.slice(0, spaceIdx);
  const timePart = shared.slice(spaceIdx + 1);

  if (withSeconds) {
    // Historical behaviour: time-first, single space, `separator` ignored —
    // the old code returned early via `.format()` before the separator logic
    // ran at all.
    return `${timePart} ${datePart}`;
  }

  const separatorValue = separator === "space" ? " " : " - ";
  return `${datePart}${separatorValue}${timePart}`;
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
