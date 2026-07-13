import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import {
  ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER,
  ITEM_CATEGORY_IMPORT_EXCEL_FIELD_LABELS,
  ItemCategoryImportExcelField,
} from "@erp/shared-interfaces";
import { applyWorkbookFont } from "../../../common/utils/excel-workbook-font.util";

export const CATEGORY_SHEET_NAME = "Danh sách nhóm hàng hóa";
export const CATEGORY_SHEET_TITLE = "DANH MỤC NHÓM HÀNG HÓA";

/** System column appended when exporting error rows. */
export const CATEGORY_STATUS_COLUMN_LABEL = "Tình trạng";

/** Layout of `DanhMucNhomHangHoa.xls` (differs from the customer template). */
export const CATEGORY_TITLE_ROW = 5;
export const CATEGORY_KEYS_ROW = 6; // EN keys — hidden
export const CATEGORY_LABELS_ROW = 7;
export const CATEGORY_DATA_START_ROW = 8;

const TAX_UNHIDE_NOTE =
  "Cửa hàng thiết lập có theo dõi Thuế GTGT và muốn nhập thuế suất cho nhóm " +
  "hàng hóa thì select từ cột C đến cột E, nhấn chuột phải chọn Unhide";

const LABEL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFCC99" },
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

export type CategoryWorkbookRow = Partial<
  Record<ItemCategoryImportExcelField, string>
> & { statusMessage?: string };

/**
 * Builds MISA-layout item-category workbooks: rows 1-4 blank (note on A2),
 * row 5 merged title, row 6 EN keys (hidden), row 7 Vietnamese labels,
 * data from row 8. The TaxRate column (D) is hidden by default; the A2 note
 * tells VAT-tracking stores how to unhide it. Exports re-import cleanly.
 */
@Injectable()
export class CategoryImportWorkbookService {
  async buildWorkbookBuffer(
    dataRows: CategoryWorkbookRow[],
    options?: { includeStatusColumn?: boolean },
  ): Promise<Buffer> {
    const includeStatus = options?.includeStatusColumn ?? false;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(CATEGORY_SHEET_NAME);

    const keys = ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER.map((c) => c as string);
    const labels = ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER.map(
      (key) => ITEM_CATEGORY_IMPORT_EXCEL_FIELD_LABELS[key],
    );
    if (includeStatus) {
      keys.push(CATEGORY_STATUS_COLUMN_LABEL);
      labels.push(CATEGORY_STATUS_COLUMN_LABEL);
    }

    sheet.getCell("A2").note = TAX_UNHIDE_NOTE;

    const titleCell = sheet.getCell(CATEGORY_TITLE_ROW, 1);
    titleCell.value = CATEGORY_SHEET_TITLE;
    titleCell.font = { bold: true, size: 16 };
    sheet.mergeCells(CATEGORY_TITLE_ROW, 1, CATEGORY_TITLE_ROW, 3);

    sheet.getRow(CATEGORY_KEYS_ROW).values = keys;
    sheet.getRow(CATEGORY_KEYS_ROW).hidden = true;

    const labelsRow = sheet.getRow(CATEGORY_LABELS_ROW);
    labels.forEach((label, colIndex) => {
      const cell = labelsRow.getCell(colIndex + 1);
      // "(*)" in red, rest in bold black — matches the MISA sample.
      const marker = label.indexOf(" (*)");
      cell.value =
        marker >= 0
          ? {
              richText: [
                { font: { bold: true }, text: label.slice(0, marker + 1) },
                {
                  font: { bold: true, color: { argb: "FFFF0000" } },
                  text: "(*)",
                },
              ],
            }
          : label;
      cell.font = { bold: true };
      cell.fill = LABEL_FILL;
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    sheet.columns = keys.map((key, index) => ({
      width: index < 3 ? 24 : 12,
      hidden: key === ItemCategoryImportExcelField.TAX_RATE,
    }));

    let rowIndex = CATEGORY_DATA_START_ROW;
    for (const dataRow of dataRows) {
      const row = sheet.getRow(rowIndex++);
      ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER.forEach((key, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.value = dataRow[key] ?? "";
        cell.border = THIN_BORDER;
      });
      if (includeStatus) {
        row.getCell(ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER.length + 1).value =
          dataRow.statusMessage ?? "";
      }
    }

    applyWorkbookFont(workbook);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
