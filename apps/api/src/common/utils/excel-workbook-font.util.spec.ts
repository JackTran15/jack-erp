import * as ExcelJS from "exceljs";
import {
  applyWorkbookFont,
  GENERATED_XLSX_FONT_NAME,
} from "./excel-workbook-font.util";

describe("applyWorkbookFont", () => {
  it("persists Times New Roman while preserving existing cell and rich-text styles", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");

    sheet.getCell("A1").value = "Regular";
    sheet.getCell("B1").value = "Styled";
    sheet.getCell("B1").font = {
      bold: true,
      color: { argb: "FFFF0000" },
      name: "Arial",
      size: 16,
    };
    sheet.getCell("C1").value = {
      richText: [
        { text: "Required", font: { bold: true, name: "Calibri" } },
        {
          text: "(*)",
          font: { color: { argb: "FFFF0000" }, italic: true },
        },
      ],
    };
    sheet.getCell("D2").numFmt = "#,##0.00";
    sheet.getCell("A1").note = {
      texts: [{ text: "Note", font: { italic: true, name: "Arial" } }],
    };

    applyWorkbookFont(workbook);

    const outputWorkbook = new ExcelJS.Workbook();
    await outputWorkbook.xlsx.load(await workbook.xlsx.writeBuffer());
    const outputSheet = outputWorkbook.getWorksheet("Sheet1")!;

    expect(outputSheet.getCell("A1").font.name).toBe(GENERATED_XLSX_FONT_NAME);
    expect(outputSheet.getCell("B1").font).toMatchObject({
      bold: true,
      color: { argb: "FFFF0000" },
      name: GENERATED_XLSX_FONT_NAME,
      size: 16,
    });
    expect(outputSheet.getCell("D2").font.name).toBe(GENERATED_XLSX_FONT_NAME);

    const richText = outputSheet.getCell("C1").value as ExcelJS.CellRichTextValue;
    expect(richText.richText[0].font).toMatchObject({
      bold: true,
      name: GENERATED_XLSX_FONT_NAME,
    });
    expect(richText.richText[1].font).toMatchObject({
      color: { argb: "FFFF0000" },
      italic: true,
      name: GENERATED_XLSX_FONT_NAME,
    });
    expect(outputSheet.getCell("A1").note).toMatchObject({
      texts: [
        {
          font: { italic: true, name: GENERATED_XLSX_FONT_NAME },
          text: "Note",
        },
      ],
    });
  });
});
