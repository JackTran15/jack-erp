import type { Worksheet } from 'exceljs';
import { InventoryImportExcelField } from '@erp/shared-interfaces';

export type ExcelColorHex = `#${string}`;

/** Number of data columns on sheet «Danh sách hàng hóa». */
export const INVENTORY_IMPORT_SHEET_COLUMN_COUNT = 43;

/** First column (0-based) with header merged vertically across rows 3–4. */
export const INVENTORY_IMPORT_SHEET_ROWSPAN2_START_COL0 = 30;

export interface ExcelMergedHeaderGroup {
  label: string;
  color: ExcelColorHex;
  startCol0: number;
  endCol0: number;
}

/** Row 3 horizontal group titles (multi-column blocks before rowspan-2 columns). */
export const INVENTORY_IMPORT_SHEET_ROW3_MERGED_GROUPS: ExcelMergedHeaderGroup[] = [
  { label: 'THÔNG TIN HÀNG HÓA', color: '#FFFF00', startCol0: 0, endCol0: 12 },
  { label: 'THUẾ', color: '#C0C0C0', startCol0: 13, endCol0: 13 },
  { label: 'KHO', color: '#92D050', startCol0: 14, endCol0: 18 },
  { label: 'ĐƠN VỊ CHUYỂN ĐỔI', color: '#FFF2CC', startCol0: 19, endCol0: 24 },
  { label: 'Link ảnh hàng hóa', color: '#FFC000', startCol0: 25, endCol0: 25 },
  { label: 'KÍCH CỠ', color: '#D9D9D9', startCol0: 26, endCol0: 29 },
];

/** Per-column fill colors (rows 3–4), aligned with template. */
export const INVENTORY_IMPORT_SHEET_COLUMN_COLORS: ExcelColorHex[] = (() => {
  const colors: ExcelColorHex[] = new Array(INVENTORY_IMPORT_SHEET_COLUMN_COUNT).fill(
    '#FFFFFF',
  );
  const setRange = (from: number, to: number, color: ExcelColorHex) => {
    for (let i = from; i <= to; i++) colors[i] = color;
  };
  setRange(0, 12, '#FFFF00');
  colors[13] = '#C0C0C0';
  setRange(14, 18, '#92D050');
  setRange(19, 24, '#FFF2CC');
  colors[25] = '#FFC000';
  setRange(26, 29, '#D9D9D9');
  setRange(30, 31, '#E4DFEC');
  setRange(32, 35, '#FFF2CC');
  setRange(36, 40, '#D9D9D9');
  colors[41] = '#D9D9D9';
  colors[42] = '#D9D9D9';
  return colors;
})();

export const INVENTORY_IMPORT_SHEET_HIDDEN_ROWS = [1, 2] as const;
export const INVENTORY_IMPORT_SHEET_GROUP_ROW_INDEX = 3;
export const INVENTORY_IMPORT_SHEET_LABEL_ROW_INDEX = 4;

export function getSheetLabelByExcelKey(
  key: InventoryImportExcelField,
  defaultLabel: string,
): string {
  if (key === InventoryImportExcelField.IMAGE_URL) return '';
  return defaultLabel;
}

export function getSheetGroupColorByIndex(columnIndex0Based: number): string {
  return (
    INVENTORY_IMPORT_SHEET_COLUMN_COLORS[columnIndex0Based] ?? '#FFFFFF'
  );
}

function isColumnInHorizontalMergedGroup(col0: number): boolean {
  return INVENTORY_IMPORT_SHEET_ROW3_MERGED_GROUPS.some(
    (g) => col0 >= g.startCol0 && col0 <= g.endCol0,
  );
}

function usesRowspan2Header(col0: number): boolean {
  return col0 >= INVENTORY_IMPORT_SHEET_ROWSPAN2_START_COL0;
}

function hexToArgb(hex: string): string {
  const normalized = hex.replace('#', '').trim();
  if (normalized.length === 6) return `FF${normalized.toUpperCase()}`;
  if (normalized.length === 8) return normalized.toUpperCase();
  return 'FFFFFFFF';
}

const HEADER_BORDER = {
  top: { style: 'thin' as const },
  left: { style: 'thin' as const },
  bottom: { style: 'thin' as const },
  right: { style: 'thin' as const },
};

export function applyHeaderCellStyle(
  cell: { font?: object; alignment?: object; fill?: object; border?: object },
  fillColorHex: string,
  options?: { wrapText?: boolean },
): void {
  cell.font = { bold: true, color: { argb: 'FF000000' } };
  cell.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: options?.wrapText ?? true,
  };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: hexToArgb(fillColorHex) },
  };
  cell.border = HEADER_BORDER;
}

/** Excel column width (character units) from label length. */
export function estimateInventoryImportColumnWidth(...texts: string[]): number {
  const maxLen = Math.max(0, ...texts.map((t) => t.length));
  if (maxLen === 0) return 10;
  return Math.min(55, Math.max(10, Math.ceil(maxLen * 1.15) + 2));
}

function horizontalGroupLabelAt(col0: number): string | undefined {
  return INVENTORY_IMPORT_SHEET_ROW3_MERGED_GROUPS.find(
    (g) => col0 >= g.startCol0 && col0 <= g.endCol0,
  )?.label;
}

export function applyInventoryImportSheetColumnWidths(
  sheet: Worksheet,
  columnLabels: string[],
): void {
  const colCount = Math.min(
    columnLabels.length,
    INVENTORY_IMPORT_SHEET_COLUMN_COUNT,
  );

  for (let col0 = 0; col0 < colCount; col0++) {
    const label = columnLabels[col0] ?? '';
    const texts = [label];
    const groupLabel = horizontalGroupLabelAt(col0);
    if (groupLabel) texts.push(groupLabel);
    sheet.getColumn(col0 + 1).width = estimateInventoryImportColumnWidth(...texts);
  }
}

/**
 * Row 4: sub-labels for grouped columns. Row 3: horizontal group titles.
 * From col 30 onward: vertical merge rows 3–4 (rowspan 2) with column label.
 */
export function applyInventoryDataSheetHeaders(
  sheet: Worksheet,
  columnLabels: string[],
): void {
  const row3 = INVENTORY_IMPORT_SHEET_GROUP_ROW_INDEX;
  const row4 = INVENTORY_IMPORT_SHEET_LABEL_ROW_INDEX;
  const colCount = Math.min(
    columnLabels.length,
    INVENTORY_IMPORT_SHEET_COLUMN_COUNT,
  );

  for (let col0 = 0; col0 < colCount; col0++) {
    if (usesRowspan2Header(col0)) continue;
    sheet.getCell(row4, col0 + 1).value = columnLabels[col0] ?? '';
  }

  for (const group of INVENTORY_IMPORT_SHEET_ROW3_MERGED_GROUPS) {
    const startCol = group.startCol0 + 1;
    const endCol = group.endCol0 + 1;
    if (startCol !== endCol) {
      sheet.mergeCells(row3, startCol, row3, endCol);
    }
    sheet.getCell(row3, startCol).value = group.label;
    for (let c = startCol; c <= endCol; c++) {
      applyHeaderCellStyle(sheet.getCell(row3, c), group.color);
    }
  }

  for (let col0 = 0; col0 < colCount; col0++) {
    if (!usesRowspan2Header(col0)) continue;
    const col = col0 + 1;
    const label = columnLabels[col0] ?? '';
    sheet.mergeCells(row3, col, row4, col);
    const cell = sheet.getCell(row3, col);
    cell.value = label;
    applyHeaderCellStyle(cell, getSheetGroupColorByIndex(col0), {
      wrapText: false,
    });
  }

  for (let col0 = 0; col0 < colCount; col0++) {
    if (usesRowspan2Header(col0)) continue;
    const color = getSheetGroupColorByIndex(col0);
    applyHeaderCellStyle(sheet.getCell(row4, col0 + 1), color);
    if (!isColumnInHorizontalMergedGroup(col0)) {
      applyHeaderCellStyle(sheet.getCell(row3, col0 + 1), color);
    }
  }

  applyInventoryImportSheetColumnWidths(sheet, columnLabels);
}

/** Row 3 cells for semicolon CSV export (merged groups + per-column labels). */
export function buildInventoryImportSheetGroupRowCells(
  columnLabels: string[],
): string[] {
  const colCount = Math.min(
    columnLabels.length,
    INVENTORY_IMPORT_SHEET_COLUMN_COUNT,
  );
  const row = columnLabels.slice(0, colCount);
  for (const group of INVENTORY_IMPORT_SHEET_ROW3_MERGED_GROUPS) {
    row[group.startCol0] = group.label;
    for (let c = group.startCol0 + 1; c <= group.endCol0; c++) {
      row[c] = '';
    }
  }
  return row;
}
