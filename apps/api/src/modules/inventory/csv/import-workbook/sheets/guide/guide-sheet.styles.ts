import type * as ExcelJS from 'exceljs';
import {
  cellText,
  rowFirstText,
  rowIncludesAny,
  setCellFill,
  setThinBorder,
} from '../../sheet-style.utils';
import { getUsedColumnCount } from '../../semicolon-grid.utils';

const TH_SECTION_FILL = '#E4DFEC';
const TABLE_HEADER_FILL = '#C6EFCE';
const PRICE_HEADER_FILL = '#FFFF00';

export function applyGuideSheetStyles(
  worksheet: ExcelJS.Worksheet,
  grid: string[][],
): void {
  const colCount = getUsedColumnCount(grid);
  if (colCount === 0) return;

  for (let c = 1; c <= colCount; c++) {
    let maxLen = 10;
    for (const row of grid) {
      maxLen = Math.max(maxLen, cellText(row[c - 1]).length + 1);
    }
    worksheet.getColumn(c).width = Math.min(48, Math.max(8, maxLen));
  }

  grid.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 1;
    const first = rowFirstText(row);
    const isTh = /^TH\d+:/i.test(first);
    const isTitle =
      /HƯỚNG DẪN/i.test(first) ||
      /VÍ DỤ MẪU/i.test(first) ||
      /^TH\d+$/i.test(first);
    const isTableHeader = rowIncludesAny(row, [
      'Mã SKU',
      'Mã hàng',
      'Tên hàng',
      'STT',
    ]) && rowIncludesAny(row, ['Tên', 'Mã', 'ĐVT', 'Giá']);

    for (let c = 1; c <= colCount; c++) {
      const cell = worksheet.getCell(excelRow, c);
      const text = cellText(row[c - 1]);
      cell.alignment = { vertical: 'top', wrapText: false };

      if (isTh || isTitle) {
        try {
          worksheet.mergeCells(excelRow, 1, excelRow, colCount);
        } catch {
          // already merged
        }
        setCellFill(cell, TH_SECTION_FILL);
        cell.font = { bold: true };
        break;
      }

      if (isTableHeader) {
        setThinBorder(cell);
        if (/giá/i.test(text)) {
          setCellFill(cell, PRICE_HEADER_FILL);
        } else if (text.length > 0) {
          setCellFill(cell, TABLE_HEADER_FILL);
        }
        cell.font = { bold: true };
        continue;
      }

      if (text.length > 0) {
        setThinBorder(cell);
      }
    }
  });
}
