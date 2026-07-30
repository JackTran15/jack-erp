import { DocumentColumn, ReportColumnDataType, ReportRow } from '@erp/shared-interfaces';
import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import { ExportDocumentHeader, ExportWriter } from './export.types';
import {
  bodyFont,
  FONT_SIZE_TITLE,
  HEADER_FILL,
  HEADER_ROW_HEIGHT,
  HEADER_ROW_HEIGHT_WITH_DESC,
  NUMBER_FORMAT,
  safeSheetName,
  THIN_BORDER,
  writeBannerRow,
  writeBlankRow,
} from './xlsx-style';

/**
 * Streams a report into .xlsx, one row at a time (ADR-08).
 *
 * `WorkbookWriter` never revisits a committed row, which changes two things
 * compared to the buffered builder it replaces:
 *
 *  - column width, border and alignment are declared up front on
 *    `sheet.columns`, never derived from the data;
 *  - the font is set as each row is written, because `applyWorkbookFont`
 *    walks the finished workbook and there is no finished workbook to walk.
 *
 * What it buys is memory that does not grow with the report: rows leave the
 * process as they arrive instead of piling up in a buffer.
 *
 * The layout follows the reference report workbook (ADR-11, see the house-style
 * section of the logical design): branch block, centred title, italic period
 * and filter lines, a blank separator, then a bordered table under a cream
 * header band. No auto-filter and no frozen pane — the reference files have
 * neither, and a report that is printed as often as it is scrolled reads better
 * without them.
 */

const DEFAULT_SHEET_NAME = 'Báo cáo';

const WIDTH_FIRST_COLUMN = 18;
const WIDTH_SECOND_COLUMN = 28;
const WIDTH_DEFAULT = 16;

const NUMBER_TYPES: ReadonlySet<ReportColumnDataType> = new Set([
  ReportColumnDataType.NUMBER,
  ReportColumnDataType.CURRENCY,
  ReportColumnDataType.PERCENT,
]);

function isNumberColumn(column: DocumentColumn): boolean {
  return NUMBER_TYPES.has(column.type);
}

/** Column width in characters: explicit hint first, then position-based defaults. */
function widthOf(column: DocumentColumn, index: number): number {
  if (column.width !== undefined) return column.width;
  if (index === 0) return WIDTH_FIRST_COLUMN;
  if (index === 1) return WIDTH_SECOND_COLUMN;
  return WIDTH_DEFAULT;
}

interface TitleLine {
  text: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  align?: 'left' | 'center';
}

/**
 * The lines above the header row. Absent parts collapse rather than leaving
 * blank rows, so a chain-wide report starts at its title.
 *
 * The branch block is left-aligned plain text — the phone number carries no
 * `SĐT:` prefix, matching the reference workbook — while the title and the
 * context lines under it are centred across the table.
 */
function titleLinesOf(header: ExportDocumentHeader): TitleLine[] {
  const lines: TitleLine[] = [];
  if (header.branch) {
    lines.push({ text: header.branch.name, bold: true });
    if (header.branch.address) lines.push({ text: header.branch.address });
    if (header.branch.phone) lines.push({ text: header.branch.phone });
  }
  lines.push({
    text: header.title,
    bold: true,
    size: FONT_SIZE_TITLE,
    align: 'center',
  });
  for (const line of header.subtitleLines) {
    lines.push({ text: line, italic: true, align: 'center' });
  }
  return lines;
}

/** Project one keyed row onto the column order; missing keys become null. */
function toCells(
  columns: DocumentColumn[],
  row: ReportRow,
): (string | number | null)[] {
  return columns.map((column) => {
    const value = row[column.col];
    return value === undefined ? null : (value as string | number | null);
  });
}

export class XlsxStreamWriter implements ExportWriter {
  private workbook?: ExcelJS.stream.xlsx.WorkbookWriter;
  private sheet?: ExcelJS.Worksheet;
  private columns: DocumentColumn[] = [];

  constructor(private readonly sheetName: string = DEFAULT_SHEET_NAME) {}

  async begin(
    target: Writable,
    header: ExportDocumentHeader,
    columns: DocumentColumn[],
  ): Promise<void> {
    this.columns = columns;
    this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: target,
      useStyles: true,
    });

    const sheet = this.workbook.addWorksheet(
      safeSheetName(this.sheetName, DEFAULT_SHEET_NAME),
      // Set at creation: a committed sheet cannot be given page setup later.
      { pageSetup: { orientation: 'portrait', paperSize: 9 } },
    );
    this.sheet = sheet;

    // Declared before the first row, and the only place data cells get their
    // format and border — there is no second pass to fix them up in.
    sheet.columns = columns.map((column, index) => ({
      width: widthOf(column, index),
      style: {
        font: bodyFont(),
        numFmt: isNumberColumn(column) ? NUMBER_FORMAT : undefined,
        border: THIN_BORDER,
        alignment: {
          horizontal:
            column.align ?? (isNumberColumn(column) ? 'right' : 'left'),
        },
      },
    })) as ExcelJS.Column[];

    this.writeTitleBlock(sheet, titleLinesOf(header), columns.length);
    writeBlankRow(sheet);
    this.writeHeaderRow(sheet, columns);
  }

  async rows(rows: ReportRow[]): Promise<void> {
    const sheet = this.requireSheet();
    for (const row of rows) sheet.addRow(toCells(this.columns, row)).commit();
  }

  async end(totals: ReportRow | null): Promise<void> {
    const sheet = this.requireSheet();
    if (totals) {
      const row = sheet.addRow(toCells(this.columns, totals));
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = bodyFont({ bold: true });
        cell.fill = HEADER_FILL;
        cell.border = THIN_BORDER;
      });
      row.commit();
    }
    await sheet.commit();
    await this.requireWorkbook().commit();
  }

  private writeTitleBlock(
    sheet: ExcelJS.Worksheet,
    lines: TitleLine[],
    lastColumn: number,
  ): void {
    for (const line of lines) {
      writeBannerRow(
        sheet,
        line.text,
        {
          bold: line.bold,
          italic: line.italic,
          size: line.size,
          align: line.align ?? 'left',
        },
        lastColumn,
      );
    }
  }

  private writeHeaderRow(
    sheet: ExcelJS.Worksheet,
    columns: DocumentColumn[],
  ): void {
    // A column's formula notation goes in the same cell as its label, on a
    // second wrapped line — `WorkbookWriter` cannot merge a header row with a
    // notation row underneath once either is committed (ADR-08), and the
    // reference MISA export uses one two-line cell, not two one-line rows.
    const hasDesc = columns.some((column) => Boolean(column.desc));
    const row = sheet.addRow(
      columns.map((column) =>
        column.desc ? `${column.label}\n${column.desc}` : column.label,
      ),
    );
    row.height = hasDesc ? HEADER_ROW_HEIGHT_WITH_DESC : HEADER_ROW_HEIGHT;
    // Per cell rather than per row: a row-level fill does not survive the
    // column-level style the data cells inherit.
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = bodyFont({ bold: true });
      cell.fill = HEADER_FILL;
      cell.border = THIN_BORDER;
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });
    row.commit();
  }

  private requireSheet(): ExcelJS.Worksheet {
    if (!this.sheet) throw new Error('XlsxStreamWriter.begin was not called');
    return this.sheet;
  }

  private requireWorkbook(): ExcelJS.stream.xlsx.WorkbookWriter {
    if (!this.workbook) throw new Error('XlsxStreamWriter.begin was not called');
    return this.workbook;
  }
}
