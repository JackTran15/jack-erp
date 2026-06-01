import type * as ExcelJS from 'exceljs';
import {
  applyHeaderCellStyle,
  applyInventoryDataSheetHeaders,
  estimateInventoryImportColumnWidth,
  INVENTORY_IMPORT_SHEET_HIDDEN_ROWS,
} from './data-sheet.layout';
import { applyInventoryImportNumericColumnFormats } from './data-sheet.export.utils';

interface ApplyDataSheetStylesOptions {
  baseLabels: string[];
  baseKeys: string[];
  baseColumnCount: number;
  extraColumnLabel?: string;
}

export function applyDataSheetStyles(
  sheet: ExcelJS.Worksheet,
  options: ApplyDataSheetStylesOptions,
): void {
  INVENTORY_IMPORT_SHEET_HIDDEN_ROWS.forEach((rowIdx) => {
    sheet.getRow(rowIdx).hidden = true;
  });

  applyInventoryDataSheetHeaders(sheet, options.baseLabels);

  if (options.extraColumnLabel) {
    applyExtraHeaderColumn(
      sheet,
      options.baseColumnCount,
      options.extraColumnLabel,
    );
  }

  applyInventoryImportNumericColumnFormats(sheet, options.baseKeys);
}

function applyExtraHeaderColumn(
  sheet: ExcelJS.Worksheet,
  baseColumnCount: number,
  label: string,
): void {
  const row3 = 3;
  const row4 = 4;
  const columnIndex = baseColumnCount + 1;
  const extraHeaderFillColor = '#D9D9D9';

  sheet.mergeCells(row3, columnIndex, row4, columnIndex);
  const cell = sheet.getCell(row3, columnIndex);
  cell.value = label;
  applyHeaderCellStyle(cell, extraHeaderFillColor, { wrapText: false });
  sheet.getColumn(columnIndex).width = estimateInventoryImportColumnWidth(label);
}
