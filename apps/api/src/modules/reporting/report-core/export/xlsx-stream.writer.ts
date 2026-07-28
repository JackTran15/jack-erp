import { DocumentColumn, ReportColumnDataType, ReportRow } from '@erp/shared-interfaces';
import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import { GENERATED_XLSX_FONT_NAME } from '../../../../common/utils/excel-workbook-font.util';
import { ExportDocumentHeader, ExportWriter } from './export.types';

/**
 * Streams a report into .xlsx, one row at a time (ADR-08).
 *
 * `WorkbookWriter` never revisits a committed row, which changes two things
 * compared to the buffered builder it replaces:
 *
 *  - column width and alignment are declared up front on `sheet.columns`,
 *    never derived from the data;
 *  - the font is set as each row is written, because `applyWorkbookFont`
 *    walks the finished workbook and there is no finished workbook to walk.
 *
 * What it buys is memory that does not grow with the report: rows leave the
 * process as they arrive instead of piling up in a buffer.
 */

/** Header band background — dark navy, white bold text. */
const HEADER_FILL_ARGB = 'FF1E3A6E';
const NUMBER_FORMAT = '#,##0.###';
const DEFAULT_SHEET_NAME = 'Báo cáo';
const TITLE_FONT_SIZE = 16;

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

/** Excel rejects sheet names over 31 chars or containing []:*?/\. */
function safeSheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || DEFAULT_SHEET_NAME;
}

interface TitleLine {
  text: string;
  bold?: boolean;
  size?: number;
}

/**
 * The lines above the header row. Absent parts collapse rather than leaving
 * blank rows, so a chain-wide report starts at its title.
 */
function titleLinesOf(header: ExportDocumentHeader): TitleLine[] {
  const lines: TitleLine[] = [];
  if (header.branch) {
    lines.push({ text: header.branch.name, bold: true });
    if (header.branch.address) lines.push({ text: header.branch.address });
    if (header.branch.phone) lines.push({ text: `SĐT: ${header.branch.phone}` });
  }
  lines.push({ text: header.title, bold: true, size: TITLE_FONT_SIZE });
  for (const line of header.subtitleLines) lines.push({ text: line });
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

    const titleLines = titleLinesOf(header);
    const headerRowNumber = titleLines.length + 1;
    const sheet = this.workbook.addWorksheet(safeSheetName(this.sheetName), {
      // Set at creation: a committed sheet cannot be given a frozen pane later.
      views: [{ state: 'frozen', ySplit: headerRowNumber }],
    });
    this.sheet = sheet;

    // Declared before the first row, and the only place data cells get their
    // format — there is no second pass to fix them up in.
    sheet.columns = columns.map((column, index) => ({
      width: widthOf(column, index),
      style: {
        font: { name: GENERATED_XLSX_FONT_NAME },
        numFmt: isNumberColumn(column) ? NUMBER_FORMAT : undefined,
        alignment: {
          horizontal:
            column.align ?? (isNumberColumn(column) ? 'right' : 'left'),
        },
      },
    })) as ExcelJS.Column[];

    this.writeTitleBlock(sheet, titleLines, columns.length);
    this.writeHeaderRow(sheet, columns, headerRowNumber);
  }

  async rows(rows: ReportRow[]): Promise<void> {
    const sheet = this.requireSheet();
    for (const row of rows) sheet.addRow(toCells(this.columns, row)).commit();
  }

  async end(totals: ReportRow | null): Promise<void> {
    const sheet = this.requireSheet();
    if (totals) {
      const row = sheet.addRow(toCells(this.columns, totals));
      row.font = { name: GENERATED_XLSX_FONT_NAME, bold: true };
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
    lines.forEach((line, index) => {
      const rowNumber = index + 1;
      const row = sheet.addRow([line.text]);
      row.font = {
        name: GENERATED_XLSX_FONT_NAME,
        bold: line.bold ?? false,
        size: line.size,
      };
      // Merge before commit: the row is gone from memory afterwards.
      if (lastColumn > 1) sheet.mergeCells(rowNumber, 1, rowNumber, lastColumn);
      row.commit();
    });
  }

  private writeHeaderRow(
    sheet: ExcelJS.Worksheet,
    columns: DocumentColumn[],
    rowNumber: number,
  ): void {
    const row = sheet.addRow(columns.map((column) => column.label));
    row.font = {
      name: GENERATED_XLSX_FONT_NAME,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL_ARGB },
    };
    row.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    row.commit();

    if (columns.length > 0) {
      sheet.autoFilter = {
        from: { row: rowNumber, column: 1 },
        to: { row: rowNumber, column: columns.length },
      };
    }
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
