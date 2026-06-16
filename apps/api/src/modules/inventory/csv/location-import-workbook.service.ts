import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { applyWorkbookFont } from "../../../common/utils/excel-workbook-font.util";

export interface LocationImportRow {
  code: string;
  name: string;
  storageName: string;
  description: string;
  statusMessage?: string;
}

const HEADERS = [
  "Mã vị trí (*)",
  "Tên vị trí (*)",
  "Thuộc kho (*)",
  "Mô tả",
];
const HEADER_ORANGE = "FFC8A0";
const TITLE_FILL = "F0F0F0";

@Injectable()
export class LocationImportWorkbookService {
  async buildWorkbookBuffer(
    rows: LocationImportRow[],
    withStatusCol = false,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");

    const colCount = withStatusCol ? 5 : 4;

    // Row 1: merged title
    sheet.mergeCells(1, 1, 1, colCount);
    const titleCell = sheet.getCell("A1");
    titleCell.value = "DANH SÁCH VỊ TRÍ HÀNG HÓA";
    titleCell.font = { bold: true, size: 13 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${TITLE_FILL}` },
    };
    sheet.getRow(1).height = 24;

    // Row 2: orange headers
    const headerLabels = withStatusCol ? [...HEADERS, "Tình trạng"] : HEADERS;
    const headerRow = sheet.getRow(2);
    headerRow.height = 20;
    headerLabels.forEach((label, i) => {
      const cell = headerRow.getCell(i + 1);
      if (label.includes("(*)")) {
        const [before, after] = label.split("(*)");
        cell.value = {
          richText: [
            { text: before, font: { bold: true } },
            { text: "(*)", font: { bold: true, color: { argb: "FFF20000" } } },
            ...(after ? [{ text: after, font: { bold: true } }] : []),
          ],
        };
      } else {
        cell.value = label;
        cell.font = { bold: true };
      }
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${HEADER_ORANGE}` },
      };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Rows 3+: data
    rows.forEach((row) => {
      const r = sheet.addRow([
        row.code,
        row.name,
        row.storageName,
        row.description,
      ]);
      if (withStatusCol) {
        r.getCell(5).value = row.statusMessage ?? "";
        r.getCell(5).font = { color: { argb: "FFCC0000" } };
      }
    });

    // Column widths
    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).width = 25;
    sheet.getColumn(3).width = 30;
    sheet.getColumn(4).width = 15;
    if (withStatusCol) sheet.getColumn(5).width = 50;

    applyWorkbookFont(workbook);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
