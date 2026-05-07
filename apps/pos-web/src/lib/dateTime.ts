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
  d: Date,
  options: FormatViDateTimeOptions = {},
): string {
  const { separator = "dash", withSeconds = false } = options;
  if (withSeconds) return viDateTimeWithSecondsFormatter.format(d).replace(",", "");
  const parts = partsOf(d);
  const separatorValue = separator === "space" ? " " : " - ";
  return `${part(parts, "day")}/${part(parts, "month")}/${part(parts, "year")}${separatorValue}${part(parts, "hour")}:${part(parts, "minute")}`;
}
