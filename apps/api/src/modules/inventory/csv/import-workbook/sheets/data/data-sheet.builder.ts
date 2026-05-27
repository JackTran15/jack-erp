import * as ExcelJS from "exceljs";
import {
  INVENTORY_IMPORT_EXCEL_COLUMNS,
  INVENTORY_IMPORT_EXCEL_TEMPLATE_VERSION,
} from "@erp/shared-interfaces";
import { getSheetLabelByExcelKey } from "./data-sheet.layout";
import {
  type InventoryImportExportRow,
  writeInventoryImportDataCell,
} from "./data-sheet.export.utils";
import { INVENTORY_IMPORT_DATA_SHEET_NAME } from "../../inventory-import-template-sheet.constants";
import { applyDataSheetStyles } from "./data-sheet.styles";

export interface BuildDataSheetOptions {
  extraColumn?: { key: string; label: string };
}

export function buildDataSheet(
  workbook: ExcelJS.Workbook,
  dataRows: InventoryImportExportRow[],
  options?: BuildDataSheetOptions,
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(INVENTORY_IMPORT_DATA_SHEET_NAME);
  const baseColumnCount = INVENTORY_IMPORT_EXCEL_COLUMNS.length;
  const baseKeys = INVENTORY_IMPORT_EXCEL_COLUMNS.map((c) => c.key);
  const baseLabels = INVENTORY_IMPORT_EXCEL_COLUMNS.map((c) =>
    getSheetLabelByExcelKey(c.key, c.label),
  );
  const keys = options?.extraColumn
    ? [...baseKeys, options.extraColumn.key]
    : baseKeys;

  sheet.getCell(1, 1).value = INVENTORY_IMPORT_EXCEL_TEMPLATE_VERSION;
  fillSheetRow(sheet, 2, keys);

  applyDataSheetStyles(sheet, {
    baseLabels,
    baseKeys,
    baseColumnCount,
    extraColumnLabel: options?.extraColumn?.label,
  });

  dataRows.forEach((row, index) => {
    fillDataRow(sheet, 5 + index, keys, row);
  });

  return sheet;
}

function fillSheetRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  values: string[],
): void {
  values.forEach((value, columnIndex) => {
    sheet.getCell(rowIndex, columnIndex + 1).value = value;
  });
}

function fillDataRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  keys: string[],
  row: InventoryImportExportRow,
): void {
  keys.forEach((key, columnIndex) => {
    writeInventoryImportDataCell(
      sheet.getCell(rowIndex, columnIndex + 1),
      key,
      row[key],
    );
  });
}
