import {
  IMPORT_DUPLICATE_MODE_LABELS,
  ImportDuplicateMode,
} from "@erp/shared-interfaces";

export const IMPORT_FILE_ACCEPT =
  ".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

export const DUPLICATE_MODE_OPTIONS = (
  Object.values(ImportDuplicateMode) as ImportDuplicateMode[]
).map((value) => ({
  value,
  label: IMPORT_DUPLICATE_MODE_LABELS[value],
}));

export function isSupportedImportFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return [".xlsx", ".xls", ".csv"].some((ext) => lower.endsWith(ext));
}
