import * as ExcelJS from "exceljs";

export const GENERATED_XLSX_FONT_NAME = "Times New Roman";

function isRichTextValue(
  value: ExcelJS.CellValue,
): value is ExcelJS.CellRichTextValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "richText" in value &&
    Array.isArray(value.richText)
  );
}

export function applyWorkbookFont(
  workbook: ExcelJS.Workbook,
  fontName = GENERATED_XLSX_FONT_NAME,
): void {
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { ...cell.font, name: fontName };

        if (isRichTextValue(cell.value)) {
          cell.value = {
            richText: cell.value.richText.map((part) => ({
              ...part,
              font: { ...part.font, name: fontName },
            })),
          };
        }

        if (
          cell.note &&
          typeof cell.note !== "string" &&
          Array.isArray(cell.note.texts)
        ) {
          cell.note = {
            ...cell.note,
            texts: cell.note.texts.map((part) => ({
              ...part,
              font: { ...part.font, name: fontName },
            })),
          };
        }
      });
    });
  });
}
