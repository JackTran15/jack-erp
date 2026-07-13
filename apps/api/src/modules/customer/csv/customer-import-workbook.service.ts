import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import {
  CUSTOMER_IMPORT_EXCEL_COLUMNS,
  CUSTOMER_IMPORT_EXCEL_TEMPLATE_VERSION,
  CustomerImportExcelField,
} from "@erp/shared-interfaces";
import { applyWorkbookFont } from "../../../common/utils/excel-workbook-font.util";

export const CUSTOMER_DATA_SHEET_NAME = "Danh sách khách hàng";
export const CUSTOMER_SHEET_TITLE = "DANH MỤC KHÁCH HÀNG";

/** System column appended when exporting error rows (not part of the 21 template columns). */
export const CUSTOMER_STATUS_COLUMN_LABEL = "Tình trạng";

export type CustomerWorkbookRow = Partial<
  Record<CustomerImportExcelField, string>
> & { statusMessage?: string };

/**
 * Builds MISA-layout customer workbooks (template `DanhMucKhachHang.xls`):
 * row 1 = version marker, row 2 = English field keys, row 3 = title,
 * row 4 = Vietnamese labels, row 5+ = data. Exported files re-import cleanly.
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
    sheet.getRow(4).values = labels;
    sheet.getRow(4).font = { bold: true };

    sheet.columns = keys.map(() => ({ width: 22 }));

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
}
