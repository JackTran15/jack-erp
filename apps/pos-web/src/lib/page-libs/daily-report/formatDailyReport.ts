const numberFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

/** Format a VND amount / count with vi-VN grouping (no decimals). */
export function formatNumberVi(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  return numberFormatter.format(n);
}

/**
 * Staff dropdown options carry a "{code} - {Tên}" label for the option list;
 * `metadata.name` (when present) is the bare name for compact contexts —
 * select triggers, print signatures.
 */
export function staffOptionName(item?: {
  label: string;
  metadata?: Record<string, unknown>;
}): string {
  if (!item) return "";
  return (item.metadata?.name as string | undefined) ?? item.label;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Format a local Date as "dd/mm/yyyy - HH:mm" — matches the print-header "Ngày in" style. */
export function formatPrintedAtVi(d: Date): string {
  const date = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${date} - ${time}`;
}
