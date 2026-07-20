import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { applyWorkbookFont } from "../../../common/utils/excel-workbook-font.util";

/** Một dòng hàng hoá trong file "Danh sách hàng hóa in tem". */
export interface BarcodeLabelExportRow {
  sku: string;
  name: string;
  barcode: string;
  color: string;
  size: string;
  description: string;
  unit: string;
  sellingPrice: number;
  quantity: number;
}

/** Cột theo mẫu xuất khẩu in tem của MISA (`local/templates/`). */
const HEADERS = [
  "STT",
  "Mã SKU",
  "Tên hàng hóa",
  "Mã vạch",
  "Màu sắc",
  "Size",
  "Mô tả",
  "Đơn vị tính",
  "Giá bán",
  "Số lượng in",
];
/** Độ rộng cột lấy nguyên từ `<cols>` trong file mẫu MISA — cố định, không co giãn theo nội dung. */
const COLUMN_WIDTHS = [
  5.28571428571429,
  10,
  18.2857142857143,
  9.28571428571429,
  9.14285714285714,
  5,
  10.8571428571429,
  12.1428571428571,
  9.28571428571429,
  12,
];
const HEADER_ORANGE = "FFC8A0";

@Injectable()
export class BarcodeLabelWorkbookService {
  async buildWorkbookBuffer(rows: BarcodeLabelExportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");

    // Hàng 1: header (mẫu MISA không có dòng tiêu đề gộp phía trên).
    const headerRow = sheet.getRow(1);
    headerRow.height = 20;
    HEADERS.forEach((label, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = label;
      cell.font = { bold: true };
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

    // Hàng 2+: dữ liệu
    rows.forEach((row, i) => {
      const r = sheet.addRow([
        i + 1,
        row.sku,
        row.name,
        row.barcode,
        row.color,
        row.size,
        row.description,
        row.unit,
        row.sellingPrice,
        row.quantity,
      ]);
      // Giá bán hiển thị "750,000" như mẫu MISA nhưng giữ kiểu số để tính toán được.
      r.getCell(9).numFmt = "#,##0";
      // Viền mọi ô dữ liệu như mẫu MISA, đồng thời chặn nội dung dài (mã vạch,
      // tên hàng) tràn sang cột bên cạnh khi ô đó rỗng.
      for (let c = 1; c <= COLUMN_WIDTHS.length; c += 1) {
        const cell = r.getCell(c);
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = { ...cell.alignment, shrinkToFit: true };
      }
    });

    COLUMN_WIDTHS.forEach((width, i) => {
      sheet.getColumn(i + 1).width = width;
    });

    applyWorkbookFont(workbook);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
