import {
  buildColumnBands,
  DocumentColumn,
  hasColumnBands,
  ReportColumnDataType,
  ReportRow,
} from '@erp/shared-interfaces';
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
 * The constraint is *committed*, not *one row at a time*: cells can still be
 * merged across two rows as long as neither has been committed yet, which is
 * what the two-tier band header relies on (ADR-12).
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

/** A header cell: the label, with the formula notation wrapped underneath. */
function labelCell(column: DocumentColumn): string {
  return column.desc ? `${column.label}\n${column.desc}` : column.label;
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
    if (hasColumnBands(columns)) {
      this.writeBandedHeaderRows(sheet, columns);
      return;
    }

    // A column's formula notation goes in the same cell as its label, on a
    // second wrapped line, because the reference MISA export uses one two-line
    // cell rather than two one-line rows.
    const hasDesc = columns.some((column) => Boolean(column.desc));
    const row = sheet.addRow(columns.map((column) => labelCell(column)));
    row.height = hasDesc ? HEADER_ROW_HEIGHT_WITH_DESC : HEADER_ROW_HEIGHT;
    this.styleHeaderRow(row);
    row.commit();
  }

  /**
   * The two-tier header: band labels above, column labels below.
   *
   * Both rows are added before either is merged or committed. `WorkbookWriter`
   * refuses to reach back into a committed row — that, not the row count, is
   * the real constraint under ADR-08 (A-28), so a merge spanning two rows is
   * fine as long as neither has gone out yet.
   *
   * A column with no band takes both rows via a vertical merge instead of
   * sitting under an empty cell, which is also what keeps the merged cell's
   * border unbroken.
   */
  private writeBandedHeaderRows(
    sheet: ExcelJS.Worksheet,
    columns: DocumentColumn[],
  ): void {
    const bands = buildColumnBands(columns);
    const hasDesc = columns.some((column) => Boolean(column.desc));

    const bandRow = sheet.addRow(
      // A banded run carries its label in the first cell of the run; an
      // unbanded column carries its own label here and the merge below pulls
      // it down through both rows.
      bands.flatMap((band) =>
        band.label === null
          ? [labelCell(columns[band.start])]
          : [band.label, ...Array<null>(band.span - 1).fill(null)],
      ),
    );
    const labelRow = sheet.addRow(
      columns.map((column, index) =>
        bands.some((band) => band.label === null && band.start === index)
          ? null
          : labelCell(column),
      ),
    );

    bandRow.height = HEADER_ROW_HEIGHT;
    labelRow.height = hasDesc ? HEADER_ROW_HEIGHT_WITH_DESC : HEADER_ROW_HEIGHT;

    for (const band of bands) {
      const first = band.start + 1;
      if (band.label === null) {
        sheet.mergeCells(bandRow.number, first, labelRow.number, first);
      } else if (band.span > 1) {
        sheet.mergeCells(bandRow.number, first, bandRow.number, first + band.span - 1);
      }
    }

    // Every physical cell, not just each merge master: styling only the master
    // leaves the tail of a merged cell without a border.
    this.styleHeaderRow(bandRow);
    this.styleHeaderRow(labelRow);

    bandRow.commit();
    labelRow.commit();
  }

  /** Per cell rather than per row: a row-level fill does not survive the
   * column-level style the data cells inherit. */
  private styleHeaderRow(row: ExcelJS.Row): void {
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
