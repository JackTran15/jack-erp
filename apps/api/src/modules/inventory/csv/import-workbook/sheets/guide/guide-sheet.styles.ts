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
const SECTION_MARKER_FILL = '#FFF2CC';
const SUBHEADING_FILL = '#F2F2F2';
const SUB_LABEL_FILL = '#DDEEFF';
const GUIDE_HEADER_FILL = '#C6EFCE';

export function applyGuideSheetStyles(
  worksheet: ExcelJS.Worksheet,
  grid: string[][],
): void {
  const colCount = getUsedColumnCount(grid);
  if (colCount === 0) return;

  worksheet.views = [{ state: 'frozen', ySplit: 2 }];

  for (let c = 1; c <= colCount; c++) {
    let maxLen = 10;
    for (const row of grid) {
      const maxLineLen = cellText(row[c - 1])
        .split('\n')
        .reduce((m, l) => Math.max(m, l.length), 0);
      maxLen = Math.max(maxLen, maxLineLen + 1);
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
    const isTableHeader =
      rowIncludesAny(row, ['Mã SKU', 'Mã hàng', 'Tên hàng', 'STT', 'Mã SKU mẫu mã']) &&
      rowIncludesAny(row, ['Tên', 'Mã', 'ĐVT', 'Giá']);
    const isGuideHeader = /^thông tin nhập$/i.test(first.trim());
    const isSectionMarker = /^\s*=>/.test(first);
    const isSubHeading = /^\s*-\s+/.test(first) && !isTableHeader;
    const isSubLabel =
      /^(không có|đã có)\s+mã/i.test(first) ||
      /^đây\s+(là|cột)/i.test(first);

    for (let c = 1; c <= colCount; c++) {
      const cell = worksheet.getCell(excelRow, c);
      const text = cellText(row[c - 1]);
      cell.alignment = { vertical: 'top', wrapText: true };

      if (isTh || isTitle) {
        try { worksheet.mergeCells(excelRow, 1, excelRow, colCount); } catch { /* already merged */ }
        setCellFill(cell, TH_SECTION_FILL);
        cell.font = { bold: true };
        break;
      }

      if (isGuideHeader) {
        // Merge col 1-3 for "Thông tin nhập", col 4-colCount for "Cách nhập"
        if (colCount >= 4) {
          try { worksheet.mergeCells(excelRow, 1, excelRow, 3); } catch { /* already merged */ }
          try { worksheet.mergeCells(excelRow, 4, excelRow, colCount); } catch { /* already merged */ }
        }
        const c1 = worksheet.getCell(excelRow, 1);
        const c4 = worksheet.getCell(excelRow, 4);
        setCellFill(c1, GUIDE_HEADER_FILL);
        setCellFill(c4, GUIDE_HEADER_FILL);
        c1.font = { bold: true };
        c4.font = { bold: true };
        setThinBorder(c1);
        setThinBorder(c4);
        break;
      }

      if (isSectionMarker) {
        try { worksheet.mergeCells(excelRow, 1, excelRow, colCount); } catch { /* already merged */ }
        setCellFill(cell, SECTION_MARKER_FILL);
        cell.font = { italic: true };
        setThinBorder(cell);
        break;
      }

      if (isSubHeading) {
        try { worksheet.mergeCells(excelRow, 1, excelRow, colCount); } catch { /* already merged */ }
        setCellFill(cell, SUBHEADING_FILL);
        cell.font = { bold: true };
        setThinBorder(cell);
        break;
      }

      if (isSubLabel) {
        try { worksheet.mergeCells(excelRow, 1, excelRow, colCount); } catch { /* already merged */ }
        setCellFill(cell, SUB_LABEL_FILL);
        setThinBorder(cell);
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

      // Guide entry rows: col[0] has topic, col[3] has instructions — merge each span
      const col0 = cellText(row[0]);
      const col3 = cellText(row[3]);
      if (col0.length > 0 && col3.length > 0 && colCount >= 4) {
        if (c === 1) {
          try { worksheet.mergeCells(excelRow, 1, excelRow, 3); } catch { /* already merged */ }
          setThinBorder(worksheet.getCell(excelRow, 1));
        } else if (c === 4) {
          try { worksheet.mergeCells(excelRow, 4, excelRow, colCount); } catch { /* already merged */ }
          setThinBorder(worksheet.getCell(excelRow, 4));
        }
        break;
      }

      if (text.length > 0) {
        setThinBorder(cell);
      }
    }
  });
}
