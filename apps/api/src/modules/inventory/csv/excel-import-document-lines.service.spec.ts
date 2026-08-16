import * as XLSX from "xlsx";
import {
  DOCUMENT_LINE_IMPORT_FIELDS,
  ExcelImportDocumentLinesService,
} from "./excel-import-document-lines.service";
import { ImportJobType } from "./inventory-import-job.entity";

describe("ExcelImportDocumentLinesService", () => {
  const itemRepo = { findOne: jest.fn() };
  const barcodeRepo = { findOne: jest.fn() };
  const storageRepo = { findOne: jest.fn() };
  const locationRepo = { findOne: jest.fn() };
  const service = new ExcelImportDocumentLinesService(
    itemRepo as never,
    barcodeRepo as never,
    storageRepo as never,
    locationRepo as never,
  );

  it("reads grouped money cells from a .xls file at full value", async () => {
    // SheetJS renders a `#,##0` cell as the en-US string "270,000"; parsing that
    // text as VN (comma = decimal mark) used to yield 270 instead of 270000.
    const sheet: XLSX.WorkSheet = {
      "!ref": "A1:E2",
      A1: { t: "s", v: "Mã SKU (*)" },
      B1: { t: "s", v: "Kho" },
      C1: { t: "s", v: "Hạn sử dụng" },
      D1: { t: "s", v: "Số lượng (*)" },
      E1: { t: "s", v: "Đơn giá" },
      A2: { t: "s", v: "SKU-1" },
      B2: { t: "s", v: "KHO SG" },
      C2: { t: "s", v: "31/12/2026" },
      D2: { t: "n", v: 4 },
      E2: { t: "n", v: 270000, z: "#,##0" },
    };
    const buffer = XLSX.write(
      { SheetNames: ["S"], Sheets: { S: sheet } },
      { type: "buffer", bookType: "xls" },
    ) as Buffer;

    const rows = await service.parseWorkbook(ImportJobType.GOODS_ISSUE, buffer);

    expect(rows).toEqual([
      expect.objectContaining({
        [DOCUMENT_LINE_IMPORT_FIELDS.SKU]: "SKU-1",
        [DOCUMENT_LINE_IMPORT_FIELDS.STORAGE]: "KHO SG",
        [DOCUMENT_LINE_IMPORT_FIELDS.EXPIRY_DATE]: "31/12/2026",
        [DOCUMENT_LINE_IMPORT_FIELDS.QUANTITY]: "4",
        [DOCUMENT_LINE_IMPORT_FIELDS.UNIT_PRICE]: "270000",
      }),
    ]);
  });
});
