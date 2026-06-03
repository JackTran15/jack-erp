import type * as ExcelJS from 'exceljs';

export function hexToArgb(hex: string): string {
  const normalized = hex.replace('#', '').trim();
  return normalized.length === 6 ? `FF${normalized.toUpperCase()}` : normalized;
}

export function setCellFill(cell: ExcelJS.Cell, hex: string): void {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: hexToArgb(hex) },
  };
}

export function setThinBorder(cell: ExcelJS.Cell): void {
  const side = { style: 'thin' as const };
  cell.border = { top: side, left: side, bottom: side, right: side };
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function rowFirstText(row: string[]): string {
  for (const cell of row) {
    const t = cellText(cell);
    if (t.length > 0) return t;
  }
  return '';
}

export function rowIncludesAny(row: string[], needles: string[]): boolean {
  const joined = row.map(cellText).join(' ').toLowerCase();
  return needles.some((n) => joined.includes(n.toLowerCase()));
}
