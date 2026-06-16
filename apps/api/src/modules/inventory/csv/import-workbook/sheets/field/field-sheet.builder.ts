import * as ExcelJS from 'exceljs';
import { applyWorkbookFont } from '../../../../../../common/utils/excel-workbook-font.util';
import { INVENTORY_IMPORT_FIELD_SHEET_NAME } from '../../inventory-import-template-sheet.constants';
import { writeGridToWorksheet } from '../../grid-worksheet.utils';
import { applyFieldSheetStyles } from './field-sheet.styles';

export function buildFieldSheet(
  workbook: ExcelJS.Workbook,
  grid: string[][],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(INVENTORY_IMPORT_FIELD_SHEET_NAME);
  writeGridToWorksheet(sheet, grid);
  applyFieldSheetStyles(sheet, grid);
  return sheet;
}

export function buildFieldSheetOnlyBuffer(grid: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  buildFieldSheet(workbook, grid);
  applyWorkbookFont(workbook);
  return workbook.xlsx.writeBuffer().then((buf) => Buffer.from(buf));
}
