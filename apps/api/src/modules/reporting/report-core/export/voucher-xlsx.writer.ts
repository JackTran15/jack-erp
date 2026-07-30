import {
  DocumentColumn,
  ReportColumnDataType,
  ReportRow,
  VoucherPrintPayload,
} from '@erp/shared-interfaces';
import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import { ExportDocumentHeader, ExportWriter } from './export.types';
import {
  bodyFont,
  FONT_SIZE_TITLE,
  HEADER_ROW_HEIGHT,
  NUMBER_FORMAT,
  safeSheetName,
  SIGNATURE_ROW_HEIGHT,
  THIN_BORDER,
  writeBannerRow,
  writeBlankRow,
} from './xlsx-style';

/**
 * Writes a stock voucher to .xlsx (ADR-10).
 *
 * A voucher is not a report with different words on it: the title, date and
 * number are three separate centred lines, the info block is bold and
 * left-aligned, the totals row carries a label, and the sheet ends with the
 * amount in words and a signature block. Folding that into `XlsxStreamWriter`
 * would mean a `kind` switch inside a renderer, which is exactly what the
 * three-seam pipeline (ADR-06) exists to avoid — so it is a second
 * `ExportWriter` instead, reading the same house style from `xlsx-style.ts`.
 *
 * `ExportPipeline`, `StaticRowsFetcher` and `HttpResponseSink` are untouched.
 *
 * Its grid is not one column per `DocumentColumn`: a column may span several
 * grid columns (merged on every row) or be hidden. `buildGrid` resolves that
 * once and everything else writes through it, because the totals row and the
 * signature block both address the grid by position and would drift apart if
 * each recomputed it.
 *
 * The signature block is written in `end()`, after the last data row. That is
 * safe under the streaming rule (ADR-08) because a voucher is always driven by
 * `StaticRowsFetcher`: every row is in memory before the writer starts, so
 * there is no row still to arrive once `end()` is called.
 */

const DEFAULT_SHEET_NAME = 'Chứng từ';
const DEFAULT_TOTALS_LABEL = 'Tổng';
const SIGNATURE_DATE_LINE = 'Ngày.......tháng.......năm............';
const SIGNATURE_HINT = '(Ký, họ tên)';
const AMOUNT_IN_WORDS_LABEL = 'Số tiền viết bằng chữ';

/** The reference vouchers start the signature row at column B, one column apart. */
const SIGNATURE_FIRST_COLUMN = 2;
const SIGNATURE_STEP = 2;

const WIDTH_INDEX_COLUMN = 6;
const WIDTH_DEFAULT = 17;

const NUMBER_TYPES: ReadonlySet<ReportColumnDataType> = new Set([
  ReportColumnDataType.NUMBER,
  ReportColumnDataType.CURRENCY,
  ReportColumnDataType.PERCENT,
]);

function isNumberColumn(column: DocumentColumn): boolean {
  return NUMBER_TYPES.has(column.type);
}

/** One logical column and the grid columns it occupies (1-based, inclusive). */
interface GridSlot {
  column: DocumentColumn;
  start: number;
  end: number;
}

interface Grid {
  slots: GridSlot[];
  /** Total grid columns — the sum of every span, not `columns.length`. */
  width: number;
}

function buildGrid(columns: DocumentColumn[]): Grid {
  const slots: GridSlot[] = [];
  let cursor = 1;
  for (const column of columns) {
    const span = Math.max(1, column.span ?? 1);
    slots.push({ column, start: cursor, end: cursor + span - 1 });
    cursor += span;
  }
  return { slots, width: cursor - 1 };
}

function widthOf(column: DocumentColumn, index: number): number {
  if (column.width !== undefined) return column.width;
  return index === 0 ? WIDTH_INDEX_COLUMN : WIDTH_DEFAULT;
}

/**
 * `PHIẾU NHẬP KHO` → `Phiếu nhập kho`.
 *
 * The title is upper-case because that is how it prints across the top of the
 * page; a sheet tab is not a heading, and the reference workbooks name theirs
 * in sentence case.
 */
function toSheetTitle(title: string): string {
  const lower = title.toLocaleLowerCase('vi-VN');
  return lower.charAt(0).toLocaleUpperCase('vi-VN') + lower.slice(1);
}

/**
 * How many leading grid columns the totals label may span.
 *
 * The label sits over the descriptive columns at the left and stops before the
 * first figure, so no total is ever hidden under it. A table that is numbers
 * all the way keeps the label in column A alone.
 */
function labelSpan(grid: Grid): number {
  const firstNumber = grid.slots.findIndex((slot) => isNumberColumn(slot.column));
  if (firstNumber <= 0) return 1;
  return grid.slots[firstNumber].start - 1;
}

/** Column B, then every other column — the pitch the reference vouchers use. */
function referencePitch(count: number): number[] {
  return Array.from(
    { length: count },
    (_, i) => SIGNATURE_FIRST_COLUMN + i * SIGNATURE_STEP,
  );
}

/**
 * Where each signature goes.
 *
 * The reference pitch when it fits inside the table; an even spread when the
 * table is wide enough to hold one box per column but too narrow for the pitch.
 * When there are more signatures than columns, the pitch wins even though it
 * runs past the table — the signature block sits below the table and is not
 * bound by its width, and every box must land in a column of its own. An even
 * spread there would round two signatures onto the same cell and one would
 * silently overwrite the other.
 */
function signatureColumns(count: number, width: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.min(SIGNATURE_FIRST_COLUMN, Math.max(width, 1))];

  const pitch = referencePitch(count);
  if (pitch[pitch.length - 1] <= width) return pitch;
  if (width < count) return pitch;

  const step = (width - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(1 + i * step));
}

export class VoucherXlsxWriter implements ExportWriter {
  private workbook?: ExcelJS.stream.xlsx.WorkbookWriter;
  private sheet?: ExcelJS.Worksheet;
  private grid: Grid = { slots: [], width: 0 };

  constructor(private readonly payload: VoucherPrintPayload) {}

  async begin(
    target: Writable,
    header: ExportDocumentHeader,
    columns: DocumentColumn[],
  ): Promise<void> {
    this.grid = buildGrid(columns);
    this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: target,
      useStyles: true,
    });

    // The sheet is named after the document type, not its number — that is
    // what the reference vouchers do, and the number is already the filename.
    const sheet = this.workbook.addWorksheet(
      safeSheetName(toSheetTitle(this.payload.title), DEFAULT_SHEET_NAME),
      { pageSetup: { orientation: 'portrait', paperSize: 9 } },
    );
    this.sheet = sheet;

    sheet.columns = this.buildSheetColumns();
    this.writeDocumentHead(sheet, header);
    this.writeHeaderRow(sheet);
  }

  async rows(rows: ReportRow[]): Promise<void> {
    const sheet = this.requireSheet();
    for (const row of rows) this.writeGridRow(sheet, (slot) => row[slot.column.col]);
  }

  async end(totals: ReportRow | null): Promise<void> {
    const sheet = this.requireSheet();
    if (totals) this.writeTotalsRow(sheet, totals);
    this.writeAmountInWords(sheet);
    this.writeSignatureBlock(sheet);
    await sheet.commit();
    await this.requireWorkbook().commit();
  }

  /**
   * One entry per grid column. A spanned column styles every grid column it
   * covers, so the merged cell keeps its border and alignment throughout.
   */
  private buildSheetColumns(): ExcelJS.Column[] {
    const out: Partial<ExcelJS.Column>[] = [];
    this.grid.slots.forEach((slot, index) => {
      const { column } = slot;
      const style = {
        font: bodyFont(),
        numFmt: isNumberColumn(column) ? NUMBER_FORMAT : undefined,
        border: THIN_BORDER,
        alignment: {
          horizontal:
            column.align ?? (isNumberColumn(column) ? 'right' : 'left'),
        },
      } as Partial<ExcelJS.Column>['style'];

      for (let c = slot.start; c <= slot.end; c += 1) {
        out.push({
          width: widthOf(column, index),
          hidden: column.hidden ?? false,
          style,
        });
      }
    });
    return out as ExcelJS.Column[];
  }

  /** One data-shaped row: value at each slot's start, merged across its span. */
  private writeGridRow(
    sheet: ExcelJS.Worksheet,
    valueOf: (slot: GridSlot) => unknown,
    decorate?: (cell: ExcelJS.Cell, slot: GridSlot) => void,
  ): ExcelJS.Row {
    const row = sheet.addRow([]);
    for (const slot of this.grid.slots) {
      const cell = row.getCell(slot.start);
      const value = valueOf(slot);
      cell.value = value === undefined ? null : (value as ExcelJS.CellValue);
      decorate?.(cell, slot);
      // Merge before commit: WorkbookWriter drops the row afterwards (ADR-08).
      if (slot.end > slot.start) {
        sheet.mergeCells(row.number, slot.start, row.number, slot.end);
      }
    }
    row.commit();
    return row;
  }

  /** Branch block, then title / date / number, then the info rows. */
  private writeDocumentHead(
    sheet: ExcelJS.Worksheet,
    header: ExportDocumentHeader,
  ): void {
    const lastColumn = this.grid.width;

    if (header.branch) {
      writeBannerRow(sheet, header.branch.name, { bold: true }, lastColumn);
      if (header.branch.address) {
        writeBannerRow(sheet, header.branch.address, {}, lastColumn);
      }
      writeBlankRow(sheet);
    }

    writeBannerRow(
      sheet,
      header.title,
      { bold: true, size: FONT_SIZE_TITLE, align: 'center' },
      lastColumn,
    );
    writeBannerRow(
      sheet,
      `Ngày ${this.payload.docDate}`,
      { bold: true, italic: true, align: 'center' },
      lastColumn,
    );
    writeBannerRow(
      sheet,
      `Số: ${this.payload.docNo}`,
      { bold: true, align: 'center' },
      lastColumn,
    );

    for (const row of this.payload.info) {
      writeBannerRow(sheet, `${row.label}: ${row.value}`, { bold: true }, lastColumn);
    }

    writeBlankRow(sheet);
  }

  private writeHeaderRow(sheet: ExcelJS.Worksheet): void {
    const row = this.writeGridRow(
      sheet,
      (slot) => slot.column.label,
      (cell) => {
        cell.font = bodyFont({ bold: true });
        cell.border = THIN_BORDER;
        cell.alignment = {
          horizontal: 'center',
          vertical: 'middle',
          wrapText: true,
        };
      },
    );
    row.height = HEADER_ROW_HEIGHT;
  }

  private writeTotalsRow(sheet: ExcelJS.Worksheet, totals: ReportRow): void {
    const span = labelSpan(this.grid);
    const label = this.payload.totalsLabel ?? DEFAULT_TOTALS_LABEL;

    const row = this.writeGridRow(
      sheet,
      (slot) => {
        if (slot.start === 1) return label;
        // Everything the label covers stays empty so the merge has nothing
        // to swallow.
        if (slot.start <= span) return null;
        return totals[slot.column.col];
      },
      (cell, slot) => {
        cell.font = bodyFont({ bold: true });
        cell.border = THIN_BORDER;
        if (slot.start === 1) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      },
    );

    if (span > 1) sheet.mergeCells(row.number, 1, row.number, span);
  }

  private writeAmountInWords(sheet: ExcelJS.Worksheet): void {
    const words = this.payload.amountInWords;
    if (!words) return;
    writeBannerRow(
      sheet,
      `${AMOUNT_IN_WORDS_LABEL}: ${words}`,
      { bold: true },
      this.grid.width,
    );
  }

  private writeSignatureBlock(sheet: ExcelJS.Worksheet): void {
    const width = Math.max(this.grid.width, 1);
    writeBlankRow(sheet);
    writeBlankRow(sheet);

    writeBannerRow(
      sheet,
      SIGNATURE_DATE_LINE,
      { italic: true, align: 'right' },
      width,
    );

    const positions = signatureColumns(this.payload.signatures.length, width);
    if (!positions.length) return;

    const labels = sheet.addRow([]);
    labels.height = SIGNATURE_ROW_HEIGHT;
    positions.forEach((column, index) => {
      const cell = labels.getCell(column);
      cell.value = this.payload.signatures[index];
      cell.font = bodyFont({ bold: true });
      cell.border = {};
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });
    labels.commit();

    const hints = sheet.addRow([]);
    positions.forEach((column) => {
      const cell = hints.getCell(column);
      cell.value = SIGNATURE_HINT;
      cell.font = bodyFont({ italic: true });
      cell.border = {};
      cell.alignment = { horizontal: 'center' };
    });
    hints.commit();
  }

  private requireSheet(): ExcelJS.Worksheet {
    if (!this.sheet) throw new Error('VoucherXlsxWriter.begin was not called');
    return this.sheet;
  }

  private requireWorkbook(): ExcelJS.stream.xlsx.WorkbookWriter {
    if (!this.workbook) throw new Error('VoucherXlsxWriter.begin was not called');
    return this.workbook;
  }
}
