import type * as ExcelJS from 'exceljs';
import {
  cellText,
  rowIncludesAny,
  setCellFill,
  setThinBorder,
} from '../../sheet-style.utils';
import { getUsedColumnCount } from '../../semicolon-grid.utils';

const HEADER_FILL = '#FFFF00';
const LINK_IMAGE_FILL = '#FFC000';
const GROUP_MERGE_COL = 2;

export function applyFieldSheetStyles(
  worksheet: ExcelJS.Worksheet,
  grid: string[][],
): void {
  const colCount = getUsedColumnCount(grid);
  if (colCount === 0) return;

  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (let c = 1; c <= colCount; c++) {
    let maxLen = 8;
    for (const row of grid) {
      const maxLineLen = cellText(row[c - 1])
        .split('\n')
        .reduce((m, l) => Math.max(m, l.length), 0);
      maxLen = Math.max(maxLen, maxLineLen + 2);
    }
    worksheet.getColumn(c).width = Math.min(60, Math.max(10, maxLen));
  }

  const headerRow = worksheet.getRow(1);
  for (let c = 1; c <= colCount; c++) {
    const cell = headerRow.getCell(c);
    setCellFill(cell, HEADER_FILL);
    cell.font = { bold: true };
    setThinBorder(cell);
    cell.alignment = { vertical: 'middle', wrapText: false };
  }

  mergeGroupColumn(worksheet, grid);

  grid.forEach((row, rowIndex) => {
    if (rowIndex === 0) return;
    const excelRow = rowIndex + 1;
    const nameCol = cellText(row[2]);
    const isLinkRow =
      nameCol.toLowerCase().includes('link ảnh') ||
      rowIncludesAny(row, ['link ảnh hàng hóa', 'link anh']);

    for (let c = 1; c <= colCount; c++) {
      const cell = worksheet.getCell(excelRow, c);
      setThinBorder(cell);
      cell.alignment = { vertical: 'top', wrapText: true };
      if (isLinkRow) {
        setCellFill(cell, LINK_IMAGE_FILL);
      }
    }
  });
}

function mergeGroupColumn(
  worksheet: ExcelJS.Worksheet,
  grid: string[][],
): void {
  if (grid.length < 2) return;

  let startRow = 2;
  let currentGroup = resolveGroupLabel(grid, 1);

  for (let r = 2; r < grid.length; r++) {
    const group = resolveGroupLabel(grid, r);
    if (group !== currentGroup) {
      tryMerge(worksheet, startRow, r, currentGroup);
      startRow = r + 1;
      currentGroup = group;
    }
  }
  tryMerge(worksheet, startRow, grid.length, currentGroup);
}

function resolveGroupLabel(grid: string[][], rowIndex: number): string {
  for (let r = rowIndex; r >= 1; r--) {
    const label = cellText(grid[r]?.[1]);
    if (label.length > 0) return label;
  }
  return '';
}

function tryMerge(
  worksheet: ExcelJS.Worksheet,
  startRow1Based: number,
  endRowExclusive1Based: number,
  groupLabel: string,
): void {
  const endRow = endRowExclusive1Based;
  if (!groupLabel || endRow <= startRow1Based) return;
  if (endRow - startRow1Based < 1) return;
  try {
    worksheet.mergeCells(startRow1Based, GROUP_MERGE_COL, endRow, GROUP_MERGE_COL);
    const cell = worksheet.getCell(startRow1Based, GROUP_MERGE_COL);
    cell.value = groupLabel;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
  } catch {
    // Ignore overlapping merges from sparse grids.
  }
}
