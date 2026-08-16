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

  it("reads the right-most separator as the decimal mark when both appear", () => {
    // SheetJS formats cells with the en-US locale: `#,##0.00` → "270,000.00".
    expect(parseGroupedDecimal("270,000.00")).toBe(270000);
    expect(parseGroupedDecimal("1.234.567,89")).toBe(1234567.89);
    expect(parseGroupedDecimal("1,234,567.89")).toBe(1234567.89);
  });

  it("keeps the VN convention when a single separator kind appears", () => {
    expect(parseGroupedDecimal("270.000")).toBe(270000);
    expect(parseGroupedDecimal("0,5")).toBe(0.5);
    expect(parseGroupedDecimal("1.234.567")).toBe(1234567);
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
