import {
  INVENTORY_IMPORT_EXCEL_COLUMNS,
  INVENTORY_IMPORT_EXCEL_TEMPLATE_VERSION,
  type InventoryImportExcelField,
} from "@erp/shared-interfaces";
import {
  formatInventoryImportGroupedNumber,
  parseGroupedDecimal,
} from "./inventory-excel-parse.utils";
import {
  buildInventoryImportSheetGroupRowCells,
  getSheetLabelByExcelKey,
} from "./import-workbook/sheets/data/data-sheet.layout";

/** Row 2 key for the optional trailing column (error export). */
export const INVENTORY_IMPORT_ERROR_COLUMN_KEY = "ImportValidationMessage";

/** Row 4 label for the optional trailing column (error export). */
export const INVENTORY_IMPORT_ERROR_COLUMN_LABEL = "Lỗi nhập khẩu";

/** Row cell values before delimited formatting (DB export may use numbers). */
export type InventoryImportDelimitedRawRow = Record<
  string,
  string | number | undefined
>;

export interface InventoryImportDelimitedDataRow {
  rawData: InventoryImportDelimitedRawRow;
  /** Value for the optional trailing column (column 44). */
  extraCell?: string;
}

export interface BuildInventoryImportDelimitedCsvOptions {
  extraColumnKey?: string;
  extraColumnLabel?: string;
}

/**
 * MISA-style semicolon CSV: version row, keys, group row, labels, then data from row 5.
 * Matches `CsvExportService.exportItems()` layout.
 */
export function buildInventoryImportDelimitedCsv(
  dataRows: InventoryImportDelimitedDataRow[],
  options: BuildInventoryImportDelimitedCsvOptions = {},
): string {
  const extraColumnKey = options.extraColumnKey ?? "";
  const extraColumnLabel = options.extraColumnLabel ?? "";

  const keys = INVENTORY_IMPORT_EXCEL_COLUMNS.map((c) => c.key);
  const labels = INVENTORY_IMPORT_EXCEL_COLUMNS.map((c) =>
    getSheetLabelByExcelKey(c.key, c.label),
  );
  const groupRow = buildInventoryImportSheetGroupRowCells(labels);

  const keysPlus: string[] = [...keys, extraColumnKey];
  const labelsPlus: string[] = [...labels, extraColumnLabel];
  const groupRowPlus: string[] = [...groupRow, ""];

  const row1 = [
    INVENTORY_IMPORT_EXCEL_TEMPLATE_VERSION,
    ...new Array(keysPlus.length - 1).fill(""),
  ];
  const row2 = keysPlus;
  const row3 = groupRowPlus;
  const row4 = labelsPlus;

  const lines: string[] = [
    toDelimitedRow(row1),
    toDelimitedRow(row2),
    toDelimitedRow(row3),
    toDelimitedRow(row4),
  ];

  for (const { rawData, extraCell } of dataRows) {
    const values = keys.map((key) =>
      toDelimitedCellValue(rawData[key as InventoryImportExcelField]),
    );
    lines.push(toDelimitedRow([...values, extraCell ?? ""]));
  }

  return lines.join("\n");
}

function toDelimitedCellValue(value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "";
    return formatInventoryImportGroupedNumber(value);
  }
  const parsed = parseGroupedDecimal(value);
  if (parsed !== undefined) return formatInventoryImportGroupedNumber(parsed);
  return String(value);
}

function escapeDelimitedCell(value: string): string {
  if (
    value.includes(";") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toDelimitedRow(cells: string[]): string {
  return cells.map((c) => escapeDelimitedCell(c ?? "")).join(";");
}
