import * as ExcelJS from 'exceljs';

export function writeGridToWorksheet(
  worksheet: ExcelJS.Worksheet,
  grid: string[][],
): void {
  grid.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      worksheet.getCell(rowIndex + 1, colIndex + 1).value = value;
    });
  });
}
