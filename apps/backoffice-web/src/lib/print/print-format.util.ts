import { DocumentColumn, ReportColumnDataType, ReportRow } from "@erp/shared-interfaces";

const NUMBER_TYPES: ReadonlySet<ReportColumnDataType> = new Set([
  ReportColumnDataType.NUMBER,
  ReportColumnDataType.CURRENCY,
  ReportColumnDataType.PERCENT,
]);

/** Escape a string for safe inclusion in HTML text content. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isNumberColumn(column: DocumentColumn): boolean {
  return NUMBER_TYPES.has(column.type);
}

export function alignOf(column: DocumentColumn): "left" | "right" | "center" {
  return column.align ?? (isNumberColumn(column) ? "right" : "left");
}

/** Formats one cell value per column type, vi-VN grouping; escapes strings. */
export function formatCell(column: DocumentColumn, value: ReportRow[string]): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    const formatted = new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: column.type === ReportColumnDataType.PERCENT ? 2 : 3,
    }).format(value);
    return column.type === ReportColumnDataType.PERCENT ? `${formatted}%` : formatted;
  }
  return escapeHtml(String(value));
}

export function renderTableRow(
  columns: DocumentColumn[],
  row: ReportRow,
  cls = "",
): string {
  const cells = columns
    .map(
      (column) =>
        `<td class="align-${alignOf(column)}">${formatCell(column, row[column.col])}</td>`,
    )
    .join("");
  return `<tr${cls ? ` class="${cls}"` : ""}>${cells}</tr>`;
}
