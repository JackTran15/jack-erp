export { StorageReportShell } from "./StorageReportShell";
export { ReportFilterPopover, withDefaults } from "./ReportFilterDialog";
export { ColumnConfigDialog, type ColumnConfigEntry } from "./ColumnConfigDialog";
export { ALL_VALUE } from "./types";
export type {
  FilterField,
  FilterFieldOption,
  FilterValues,
  SubtitleSegment,
} from "./types";

import { ALL_VALUE, type FilterField, type FilterValues } from "./types";

/**
 * Resolve the human-readable label for a filter value, used to render
 * the centered subtitle under the page title.
 */
export function resolveLabel(field: FilterField, values: FilterValues): string {
  const raw = values[field.key];
  if (field.type === "select") {
    const v = (raw as string | undefined) ?? ALL_VALUE;
    return field.options.find((o) => o.value === v)?.label ?? v;
  }
  if (field.type === "multi-select") {
    const arr = (raw as string[] | undefined) ?? [];
    if (arr.length === 0) return "Tất cả";
    if (arr.length === 1)
      return field.options.find((o) => o.value === arr[0])?.label ?? arr[0]!;
    return `${arr.length} mục đã chọn`;
  }
  if (field.type === "radio-scope") {
    const mode = (raw as string | undefined) ?? ALL_VALUE;
    if (mode === ALL_VALUE) return field.allLabel;
    const arr = (values[`${field.key}__values`] as string[] | undefined) ?? [];
    if (arr.length === 0) return field.scopeLabel;
    if (arr.length === 1)
      return field.options.find((o) => o.value === arr[0])?.label ?? arr[0]!;
    return `${arr.length} mục`;
  }
  return "";
}
