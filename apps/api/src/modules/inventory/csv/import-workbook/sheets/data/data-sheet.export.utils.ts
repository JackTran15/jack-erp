import type { Cell } from "exceljs";
import {
  InventoryImportExcelField,
  INVENTORY_IMPORT_EXCEL_NUMERIC_FIELDS,
} from "@erp/shared-interfaces";
import {
  formatInventoryImportGroupedNumber,
  parseGroupedDecimal,
} from "../../../inventory-excel-parse.utils";

export type InventoryImportExportRowValue = string | number | undefined;
export type InventoryImportExportRow = Record<
  string,
  InventoryImportExportRowValue
>;

const NUMERIC_FIELD_SET = new Set<string>(
  INVENTORY_IMPORT_EXCEL_NUMERIC_FIELDS,
);

/** Money/qty columns — export as `350.000` text (MISA template). */
const GROUPED_DISPLAY_FIELDS = new Set<string>(
  INVENTORY_IMPORT_EXCEL_NUMERIC_FIELDS.filter((f) => {
    const fieldsToExclude = [
      InventoryImportExcelField.TAX_RATE,
      InventoryImportExcelField.HEIGHT,
      InventoryImportExcelField.WIDTH,
      InventoryImportExcelField.LENGTH,
      InventoryImportExcelField.WEIGHT,
    ];
    return !fieldsToExclude.includes(f);
  }),
);

export function isInventoryImportNumericField(field: string): boolean {
  return NUMERIC_FIELD_SET.has(field);
}

export function usesGroupedDisplayFormat(field: string): boolean {
  return GROUPED_DISPLAY_FIELDS.has(field);
}

export function coerceInventoryImportExportNumber(
  field: string,
  raw: InventoryImportExportRowValue,
): number | undefined {
  if (!isInventoryImportNumericField(field)) return undefined;
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }
  return parseGroupedDecimal(String(raw));
}

export function writeInventoryImportDataCell(
  cell: Cell,
  field: string,
  raw: InventoryImportExportRowValue,
): void {
  const num = coerceInventoryImportExportNumber(field, raw);

  if (num !== undefined && usesGroupedDisplayFormat(field)) {
    cell.value = formatInventoryImportGroupedNumber(num);
    return;
  }

  if (num !== undefined) {
    cell.value = num;
    cell.numFmt = "0.##";
    return;
  }

  if (raw === undefined || raw === null) {
    cell.value = "";
    return;
  }
  cell.value = typeof raw === "number" ? raw : String(raw);
}

export function applyInventoryImportNumericColumnFormats(
  _sheet: { getColumn: (index: number) => { numFmt?: string } },
  _keys: string[],
): void {
  // Grouped money/qty columns are written as MISA-style text (`350.000`).
}
