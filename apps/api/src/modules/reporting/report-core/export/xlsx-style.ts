import * as ExcelJS from 'exceljs';
import { GENERATED_XLSX_FONT_NAME } from '../../../../common/utils/excel-workbook-font.util';

/**
 * The one place the generated-workbook house style is written down (ADR-11).
 *
 * Two writers render into .xlsx — `XlsxStreamWriter` for report tables and
 * `VoucherXlsxWriter` for stock vouchers — and they have to agree on font,
 * borders, fills and number format. Declaring that twice is the copy-paste this
 * whole feature exists to stop, so it lives here and both read from it.
 *
 * Every value below was measured off the reference workbooks in `examples/ERP`
 * (`xl/styles.xml`), not eyeballed. The print renderers follow the same house
 * style in CSS, deliberately without sharing code across the BE/FE boundary —
 * `ReportDocumentPayload` states it carries no presentation, and a colour
 * constant shipped through `@erp/shared-interfaces` would make that false.
 */

/** Header band and totals band background — the reference workbooks' cream. */
export const HEADER_FILL_ARGB = 'FFFDE9D9';

/** Integer thousands, no decimals: `numFmtId 177` in the reference workbooks. */
export const NUMBER_FORMAT = '#,##0';

export const FONT_SIZE_BODY = 12;
export const FONT_SIZE_TITLE = 18;

/** Row height for the signature-label band, matching the reference vouchers. */
export const SIGNATURE_ROW_HEIGHT = 31.5;

/** Header rows wrap, so they need more than one line of height. */
export const HEADER_ROW_HEIGHT = 30;

/**
 * Header height when any column carries a formula notation under its label —
 * the cell holds two wrapped lines instead of one (ADR-05, revenue-by-item-
 * misa-parity). Reports with no notation keep HEADER_ROW_HEIGHT so their
 * layout does not shift. Measured against the generated font/size in this
 * file so the second line does not clip when the workbook is opened.
 */
export const HEADER_ROW_HEIGHT_WITH_DESC = 45;

export const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

export const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: HEADER_FILL_ARGB },
};

export interface FontOptions {
  bold?: boolean;
  italic?: boolean;
  size?: number;
}

/** A font in the house face; callers only ever vary weight, slant and size. */
export function bodyFont(options: FontOptions = {}): Partial<ExcelJS.Font> {
  return {
    name: GENERATED_XLSX_FONT_NAME,
    bold: options.bold ?? false,
    italic: options.italic ?? false,
    size: options.size ?? FONT_SIZE_BODY,
  };
}

export interface BannerOptions extends FontOptions {
  align?: 'left' | 'center' | 'right';
}

/**
 * Write one full-width line above (or below) the table — branch name, title,
 * period, an info row, the amount in words.
 *
 * The merge has to happen before `commit()`: `WorkbookWriter` drops a row from
 * memory the moment it is committed and will not merge it afterwards (ADR-08).
 * That ordering is the reason this is a helper rather than three lines at each
 * call site.
 */
export function writeBannerRow(
  sheet: ExcelJS.Worksheet,
  text: string,
  options: BannerOptions,
  lastColumn: number,
): ExcelJS.Row {
  const row = sheet.addRow([text]);
  const rowNumber = row.number;

  const cell = row.getCell(1);
  cell.font = bodyFont(options);
  cell.alignment = {
    horizontal: options.align ?? 'left',
    vertical: 'middle',
  };
  // Column A carries the table border, and a merged cell is drawn with its
  // master's style — without this the title and every info line would print
  // inside a box that the reference documents do not have.
  cell.border = {};

  if (lastColumn > 1) sheet.mergeCells(rowNumber, 1, rowNumber, lastColumn);
  row.commit();
  return row;
}

/** A committed empty row — the reference layouts use these as separators. */
export function writeBlankRow(sheet: ExcelJS.Worksheet): void {
  sheet.addRow([]).commit();
}

/** Excel rejects sheet names over 31 chars or containing []:*?/\. */
export function safeSheetName(name: string, fallback: string): string {
  return name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || fallback;
}
