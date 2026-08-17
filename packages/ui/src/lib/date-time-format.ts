/**
 * Vietnamese-locale date/time formatting, always pinned to Asia/Ho_Chi_Minh
 * wall-clock time regardless of the host/browser's own timezone. The zone is
 * fixed, not configurable by the caller — nothing in this codebase currently
 * needs a different one.
 */

export interface FormatViDateTimeOptions {
  /** Include seconds (HH:mm:ss instead of HH:mm). Default: false. */
  withSeconds?: boolean;
}

/**
 * Formats a Date/ISO string as `dd/MM/yyyy HH:mm` (or `HH:mm:ss` with
 * `withSeconds: true`), always in Asia/Ho_Chi_Minh time. Returns `""` for
 * invalid/unparseable input.
 *
 * Built from `formatToParts` rather than `.format()` directly: `vi-VN`'s
 * combined date+time CLDR pattern for these fields renders time-first
 * (`HH:mm dd/MM/yyyy`), not `dd/MM/yyyy HH:mm` — confirmed independent of
 * `timeZone`, so parts are assembled explicitly to match this module's
 * documented `dd/MM/yyyy HH:mm` output contract.
 */
export function formatViDateTime(
  input: Date | string,
  options: FormatViDateTimeOptions = {},
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(options.withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const time = options.withSeconds
    ? `${get("hour")}:${get("minute")}:${get("second")}`
    : `${get("hour")}:${get("minute")}`;
  return `${get("day")}/${get("month")}/${get("year")} ${time}`;
}

/**
 * Formats a Date/ISO string as `dd/MM/yyyy`, always in Asia/Ho_Chi_Minh time.
 * Returns `""` for invalid/unparseable input.
 */
export function formatViDate(input: Date | string): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
}
