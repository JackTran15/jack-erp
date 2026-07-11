import {
  ItemCategoryImportExcelField,
} from "@erp/shared-interfaces";
import * as ExcelJS from "exceljs";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { CategoryExportService } from "./category-export.service";
import {
  CategoryImportWorkbookService,
  CATEGORY_DATA_START_ROW,
} from "./category-import-workbook.service";

const actor = {
  organizationId: "org-1",
  branchId: "branch-1",
  userId: "user-1",
} as ActorContext;

describe("CategoryExportService", () => {
  it("emits rows in UI tree order: depth-first, siblings sorted by code", async () => {
    // Repo returns code-sorted rows (mirrors the find() order in the service).
    const categories = [
      { id: "c01", code: "01", name: "GIÀY DÉP", parentGroupId: null },
      { id: "c0101", code: "0101", name: "Dép nam", parentGroupId: "c01" },
      { id: "c0102", code: "0102", name: "Giày nhập", parentGroupId: "c01" },
      { id: "c02", code: "02", name: "PHỤ KIỆN", parentGroupId: null },
      { id: "c0202", code: "0202", name: "Nón", parentGroupId: "c02" },
      { id: "c9999", code: "9999", name: "Mồ côi", parentGroupId: "missing" },
    ];
    const categoryRepo = { find: jest.fn(async () => categories) };

    const service = new CategoryExportService(
      categoryRepo as never,
      new CategoryImportWorkbookService(),
    );

    const buffer = await service.exportCategoriesExcelBuffer(actor);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];
    const codes: string[] = [];
    const parents: string[] = [];
    for (let i = CATEGORY_DATA_START_ROW; i <= sheet.rowCount; i++) {
      const code = String(sheet.getRow(i).getCell(1).value ?? "");
      if (!code) continue;
      codes.push(code);
      parents.push(String(sheet.getRow(i).getCell(3).value ?? ""));
    }

    // Children directly under their parent; missing-parent rows act as roots.
    expect(codes).toEqual(["01", "0101", "0102", "02", "0202", "9999"]);
    expect(parents).toEqual(["", "01", "01", "", "02", ""]);
  });

  it("leaves TaxRate blank (DEFER — no entity field)", async () => {
    const categoryRepo = {
      find: jest.fn(async () => [
        { id: "c01", code: "01", name: "GIÀY DÉP", parentGroupId: null },
      ]),
    };
    const service = new CategoryExportService(
      categoryRepo as never,
      new CategoryImportWorkbookService(),
    );

    const buffer = await service.exportCategoriesExcelBuffer(actor);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];
    const taxCol =
      Object.values(ItemCategoryImportExcelField).indexOf(
        ItemCategoryImportExcelField.TAX_RATE,
      ) + 1;
    expect(
      String(sheet.getRow(CATEGORY_DATA_START_ROW).getCell(taxCol).value ?? ""),
    ).toBe("");
  });
});
