import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import {
  CUSTOMER_IMPORT_EXCEL_COLUMNS,
  CUSTOMER_IMPORT_EXCEL_TEMPLATE_VERSION,
  CustomerImportExcelField,
} from "@erp/shared-interfaces";
import { applyWorkbookFont } from "../../../common/utils/excel-workbook-font.util";
import { setCellFill } from "../../inventory/csv/import-workbook/sheet-style.utils";

export const CUSTOMER_DATA_SHEET_NAME = "Danh sách khách hàng";
export const CUSTOMER_SHEET_TITLE = "DANH MỤC KHÁCH HÀNG";

/** System column appended when exporting error rows (not part of the 22 template columns). */
export const CUSTOMER_STATUS_COLUMN_LABEL = "Tình trạng";

/** Header fill of the stock MISA `DanhMucKhachHang.xls` label row. */
const CUSTOMER_HEADER_FILL = "#F2DCDB";

/** Label-row height matching the MISA template. */
const CUSTOMER_LABEL_ROW_HEIGHT = 21;

/** Width of the trailing `Tình trạng` column on error-row exports. */
const CUSTOMER_STATUS_COLUMN_WIDTH = 40;

/**
 * Per-column widths lifted from the MISA template. Keyed by field rather than
 * position so inserting a column does not shift the rest.
 */
const CUSTOMER_COLUMN_WIDTHS: Record<CustomerImportExcelField, number> = {
  [CustomerImportExcelField.CUSTOMER_CODE]: 19,
  [CustomerImportExcelField.CUSTOMER_NAME]: 28.14,
  [CustomerImportExcelField.CUSTOMER_CATEGORY_CODE]: 23.71,
  [CustomerImportExcelField.TEL]: 23.57,
  [CustomerImportExcelField.MAXIMUM_DEBT_AMOUNT]: 16.57,
  [CustomerImportExcelField.DUE_DATE]: 16.57,
  [CustomerImportExcelField.BIRTHDAY]: 16.57,
  [CustomerImportExcelField.GENDER]: 16.57,
  [CustomerImportExcelField.MEMBER_CARD_NO]: 20.71,
  [CustomerImportExcelField.MEMBER_LEVEL_CODE]: 20.71,
  [CustomerImportExcelField.POINTS]: 16.57,
  [CustomerImportExcelField.IDENTIFY_NUMBER]: 19.71,
  [CustomerImportExcelField.EXPORT_PROVINCE]: 24.42,
  [CustomerImportExcelField.EXPORT_DISTRICT]: 30.14,
  [CustomerImportExcelField.EXPORT_VILLAGE]: 24.14,
  [CustomerImportExcelField.ADDRESS]: 28.28,
  [CustomerImportExcelField.EMAIL]: 25.14,
  [CustomerImportExcelField.COMPANY_NAME]: 23.71,
  [CustomerImportExcelField.COMPANY_TAX_CODE]: 21,
  [CustomerImportExcelField.DESCRIPTION]: 32.14,
  [CustomerImportExcelField.EMPLOYEE_CODE]: 25.85,
  [CustomerImportExcelField.EMPLOYEE_NAME]: 26.71,
};

/**
 * Columns forced to Excel text format, as in the MISA template — without it
 * Excel eats the leading zero of phone numbers and ID numbers.
 */
const CUSTOMER_TEXT_FORMAT_FIELDS: ReadonlySet<CustomerImportExcelField> =
  new Set([
    CustomerImportExcelField.TEL,
    CustomerImportExcelField.MAXIMUM_DEBT_AMOUNT,
    CustomerImportExcelField.DUE_DATE,
    CustomerImportExcelField.MEMBER_CARD_NO,
    CustomerImportExcelField.IDENTIFY_NUMBER,
    CustomerImportExcelField.EXPORT_PROVINCE,
    CustomerImportExcelField.EXPORT_DISTRICT,
    CustomerImportExcelField.EXPORT_VILLAGE,
    CustomerImportExcelField.COMPANY_TAX_CODE,
  ]);

/** Renders the `(*)` required marker in red, the rest of the label in black. */
function labelCellValue(label: string): ExcelJS.CellValue {
  const markerIndex = label.indexOf("(*)");
  if (markerIndex < 0) return label;
  return {
    richText: [
      {
        text: label.slice(0, markerIndex),
        font: { bold: true, color: { argb: "FF000000" } },
      },
      { text: "(*)", font: { bold: true, color: { argb: "FFFF0000" } } },
      {
        text: label.slice(markerIndex + 3),
        font: { bold: true, color: { argb: "FF000000" } },
      },
    ].filter((part) => part.text.length > 0),
  };
}

export type CustomerWorkbookRow = Partial<
  Record<CustomerImportExcelField, string>
> & { statusMessage?: string };

/**
 * Builds MISA-layout customer workbooks (`DanhMucKhachHang`): row 1 = version
 * marker, row 2 = English field keys, row 3 = title, row 4 = Vietnamese labels,
 * row 5+ = data. Exported files re-import cleanly. Also serves as the
 * downloadable import template, so the chrome mirrors the original .xls.
 */
@Injectable()
export class CustomerImportWorkbookService {
  async buildWorkbookBuffer(
    dataRows: CustomerWorkbookRow[],
    options?: { includeStatusColumn?: boolean },
  ): Promise<Buffer> {
    const includeStatus = options?.includeStatusColumn ?? false;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(CUSTOMER_DATA_SHEET_NAME);

    const keys = CUSTOMER_IMPORT_EXCEL_COLUMNS.map((c) => c.key as string);
    const labels = CUSTOMER_IMPORT_EXCEL_COLUMNS.map((c) => c.label);
    if (includeStatus) {
      keys.push(CUSTOMER_STATUS_COLUMN_LABEL);
      labels.push(CUSTOMER_STATUS_COLUMN_LABEL);
    }

    // Row 1: version marker; row 2: field keys; row 3: title; row 4: labels.
    // Rows 1–2 are technical (re-import contract) — hidden like the MISA
    // template and the inventory export (INVENTORY_IMPORT_SHEET_HIDDEN_ROWS).
    sheet.getRow(1).getCell(1).value = CUSTOMER_IMPORT_EXCEL_TEMPLATE_VERSION;
    sheet.getRow(1).hidden = true;
    sheet.getRow(2).values = keys;
    sheet.getRow(2).hidden = true;
    sheet.getRow(3).getCell(1).value = CUSTOMER_SHEET_TITLE;
    sheet.getRow(3).font = { bold: true };
    sheet.mergeCells(3, 1, 3, keys.length);
    sheet.getRow(4).values = labels;
    sheet.getRow(4).font = { bold: true };

    this.applyHeaderStyles(sheet, keys.length);

    let rowIndex = 5;
    for (const dataRow of dataRows) {
      const row = sheet.getRow(rowIndex++);
      CUSTOMER_IMPORT_EXCEL_COLUMNS.forEach((column, colIndex) => {
        row.getCell(colIndex + 1).value = dataRow[column.key] ?? "";
      });
      if (includeStatus) {
        row.getCell(CUSTOMER_IMPORT_EXCEL_COLUMNS.length + 1).value =
          dataRow.statusMessage ?? "";
      }
    }

    applyWorkbookFont(workbook);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Reproduces the MISA template chrome: rose label row, red `(*)` markers,
   * per-column widths and text-format columns.
   */
  private applyHeaderStyles(sheet: ExcelJS.Worksheet, columnCount: number): void {
    const labelRow = sheet.getRow(4);
    labelRow.height = CUSTOMER_LABEL_ROW_HEIGHT;

    // columnCount already covers the trailing status column, if present; it has
    // no CustomerImportExcelField and just gets the fill and a default width.
    for (let index = 0; index < columnCount; index++) {
      const definition = CUSTOMER_IMPORT_EXCEL_COLUMNS[index];
      const column = sheet.getColumn(index + 1);
      column.width = definition
        ? CUSTOMER_COLUMN_WIDTHS[definition.key]
        : CUSTOMER_STATUS_COLUMN_WIDTH;
      if (definition && CUSTOMER_TEXT_FORMAT_FIELDS.has(definition.key)) {
        column.numFmt = "@";
      }

      const cell = labelRow.getCell(index + 1);
      if (definition) cell.value = labelCellValue(definition.label);
      setCellFill(cell, CUSTOMER_HEADER_FILL);
    }
  }
}
