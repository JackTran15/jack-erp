import * as ExcelJS from "exceljs";
import { InventoryImportExcelField } from "@erp/shared-interfaces";
import {
  coerceInventoryImportExportNumber,
  writeInventoryImportDataCell,
} from "./import-workbook/sheets/data/data-sheet.export.utils";
import { parseGroupedDecimal } from "./inventory-excel-parse.utils";

describe("inventory-import-excel-export.utils", () => {
  it("parses grouped VN strings to numbers for export", () => {
    expect(
      coerceInventoryImportExportNumber(
        InventoryImportExcelField.COST_PRICE,
        "350.000",
      ),
    ).toBe(350000);
    expect(
      coerceInventoryImportExportNumber(
        InventoryImportExcelField.MINIMUM_STOCK,
        "0",
      ),
    ).toBe(0);
  });

  it("does not treat SQL decimals as VN grouped numbers", () => {
    expect(parseGroupedDecimal("350000.00")).toBe(350000);
    expect(
      coerceInventoryImportExportNumber(
        InventoryImportExcelField.COST_PRICE,
        "350000.00",
      ),
    ).toBe(350000);
  });

  it("writes money columns as MISA-style grouped text", () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("t");
    const cell = sheet.getCell(1, 1);

    writeInventoryImportDataCell(
      cell,
      InventoryImportExcelField.COST_PRICE,
      350000,
    );

    expect(cell.value).toBe("350.000");
    expect(cell.type).toBe(ExcelJS.ValueType.String);
  });
});
