import * as ExcelJS from 'exceljs';
import { applyWorkbookFont } from '../../../../../../common/utils/excel-workbook-font.util';
import { INVENTORY_IMPORT_GUIDE_SHEET_NAME } from '../../inventory-import-template-sheet.constants';
import { writeGridToWorksheet } from '../../grid-worksheet.utils';
import { applyGuideSheetStyles } from './guide-sheet.styles';

export function buildGuideSheet(
  workbook: ExcelJS.Workbook,
  grid: string[][],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(INVENTORY_IMPORT_GUIDE_SHEET_NAME);
  writeGridToWorksheet(sheet, grid);
  applyGuideSheetStyles(sheet, grid);
  return sheet;
}

export function buildGuideSheetOnlyBuffer(grid: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  buildGuideSheet(workbook, grid);
  applyWorkbookFont(workbook);
  return workbook.xlsx.writeBuffer().then((buf) => Buffer.from(buf));
}
