import {
  ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER,
  ITEM_CATEGORY_IMPORT_EXCEL_FIELD_LABELS,
  ItemCategoryImportExcelField,
  ImportJobStatus,
} from "@erp/shared-interfaces";
import * as ExcelJS from "exceljs";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { CategoryImportService } from "./category-import.service";
import {
  CategoryImportWorkbookService,
  CATEGORY_KEYS_ROW,
} from "./category-import-workbook.service";
import { ImportRowStatus } from "./inventory-import-job-row.entity";

const actor = {
  organizationId: "org-1",
  branchId: "branch-1",
  userId: "user-1",
} as ActorContext;

const F = ItemCategoryImportExcelField;

/** MISA category layout: rows 1-4 blank, row 5 title, row 6 keys, row 7 labels, data row 8+. */
async function buildWorkbookBuffer(
  dataRows: Array<Partial<Record<ItemCategoryImportExcelField, string>> | null>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Danh sách nhóm hàng hóa");
  sheet.getCell("A5").value = "DANH MỤC NHÓM HÀNG HÓA";
  sheet.getRow(6).values = ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER.map(String);
  sheet.getRow(7).values = ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER.map(
    (key) => ITEM_CATEGORY_IMPORT_EXCEL_FIELD_LABELS[key],
  );
  let rowIndex = 8;
  for (const row of dataRows) {
    const sheetRow = sheet.getRow(rowIndex++);
    if (row) {
      sheetRow.values = ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER.map(
        (key) => row[key] ?? "",
      );
    }
  }
  // Force rowCount to include trailing blank rows.
  sheet.getRow(rowIndex - 1).commit?.();
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function asFile(buffer: Buffer, name = "DanhMucNhomHangHoa.xlsx") {
  return { buffer, originalname: name } as Express.Multer.File;
}

function queryBuilderStub(results: () => unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => results()),
    getOne: jest.fn(async () => results()[0] ?? null),
  };
}

describe("CategoryImportService", () => {
  let savedRows: Array<Record<string, unknown>>;
  let existingCategories: Array<Record<string, unknown>>;

  const jobRepo = {
    findOne: jest.fn(),
    create: jest.fn((data: object) => ({ ...data })),
    save: jest.fn((job: Record<string, unknown>) => ({ id: "job-1", ...job })),
    delete: jest.fn(),
  };
  const rowRepo = {
    create: jest.fn((data: object) => ({ ...data })),
    save: jest.fn((rows: Array<Record<string, unknown>>) => {
      savedRows.push(...rows);
      return rows;
    }),
    find: jest.fn(),
    findAndCount: jest.fn(async () => [savedRows, savedRows.length]),
    delete: jest.fn(),
  };
  const categoryRepo = {
    createQueryBuilder: jest.fn(() =>
      queryBuilderStub(() => existingCategories),
    ),
  };
  const dataSource = { transaction: jest.fn() };
  const wsEmitter = { emitToOrg: jest.fn() };

  const service = new CategoryImportService(
    jobRepo as never,
    rowRepo as never,
    categoryRepo as never,
    dataSource as never,
    new CategoryImportWorkbookService(),
    wsEmitter as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    savedRows = [];
    existingCategories = [];
    jobRepo.findOne.mockResolvedValue(null);
  });

  it("parses the MISA layout (keys row 6, data row 8) and validates a clean row", async () => {
    const buffer = await buildWorkbookBuffer([
      { [F.ITEM_CATEGORY_CODE]: "01", [F.ITEM_CATEGORY_NAME]: "GIÀY DÉP" },
    ]);

    const result = await service.validate(asFile(buffer), actor);

    expect(result.job.status).toBe(ImportJobStatus.VALIDATED);
    const row = savedRows[0] as {
      status: ImportRowStatus;
      rowNumber: number;
      normalizedData: Record<string, unknown>;
      warningMessages?: unknown[];
    };
    expect(row.status).toBe(ImportRowStatus.VALID);
    expect(row.rowNumber).toBe(8);
    expect(row.normalizedData).toMatchObject({ code: "01", name: "GIÀY DÉP" });
    expect(row.warningMessages).toBeUndefined();
  });

  it("requires code and name", async () => {
    const buffer = await buildWorkbookBuffer([
      { [F.ITEM_CATEGORY_NAME]: "Thiếu mã" },
      { [F.ITEM_CATEGORY_CODE]: "02" },
    ]);

    const result = await service.validate(asFile(buffer), actor);

    expect(result.job.status).toBe(ImportJobStatus.FAILED);
    const [noCode, noName] = savedRows as Array<{
      errorMessages: Array<{ column?: string; code: string }>;
    }>;
    expect(noCode.errorMessages).toEqual([
      expect.objectContaining({ column: F.ITEM_CATEGORY_CODE, code: "REQUIRED" }),
    ]);
    expect(noName.errorMessages).toEqual([
      expect.objectContaining({ column: F.ITEM_CATEGORY_NAME, code: "REQUIRED" }),
    ]);
  });

  it("resolves parents from the file regardless of row order; unknown parent = warning + root", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        [F.ITEM_CATEGORY_CODE]: "0102",
        [F.ITEM_CATEGORY_NAME]: "Giày nhập",
        [F.PARENT_NAME]: "01",
      },
      {
        [F.ITEM_CATEGORY_CODE]: "01",
        [F.ITEM_CATEGORY_NAME]: "GIÀY DÉP",
        [F.PARENT_NAME]: "KCT",
      },
    ]);

    await service.validate(asFile(buffer), actor);

    const [child, root] = savedRows as Array<{
      status: ImportRowStatus;
      normalizedData: Record<string, unknown>;
      warningMessages?: Array<{ code: string }>;
    }>;
    expect(child.status).toBe(ImportRowStatus.VALID);
    expect(child.normalizedData.parentCode).toBe("01");
    expect(root.status).toBe(ImportRowStatus.VALID);
    expect(root.normalizedData.parentCode).toBeUndefined();
    expect(root.warningMessages).toEqual([
      expect.objectContaining({ code: "PARENT_NOT_FOUND" }),
    ]);
  });

  it("rejects duplicate codes in the file and names owned by another category", async () => {
    existingCategories = [{ id: "cat-9", code: "99", name: "QUÀ TẶNG" }];
    const buffer = await buildWorkbookBuffer([
      { [F.ITEM_CATEGORY_CODE]: "01", [F.ITEM_CATEGORY_NAME]: "A" },
      { [F.ITEM_CATEGORY_CODE]: "01", [F.ITEM_CATEGORY_NAME]: "B" },
      { [F.ITEM_CATEGORY_CODE]: "03", [F.ITEM_CATEGORY_NAME]: "QUÀ TẶNG" },
    ]);

    await service.validate(asFile(buffer), actor);

    const [, dupCode, nameTaken] = savedRows as Array<{
      status: ImportRowStatus;
      errorMessages: Array<{ code: string }>;
    }>;
    expect(dupCode.errorMessages).toEqual([
      expect.objectContaining({ code: "DUPLICATE_IN_FILE" }),
    ]);
    expect(nameTaken.errorMessages).toEqual([
      expect.objectContaining({ code: "NAME_TAKEN" }),
    ]);
  });

  it("SKIP mode rejects existing codes; UPDATE mode targets the existing category", async () => {
    existingCategories = [{ id: "cat-1", code: "01", name: "GIÀY DÉP" }];
    const buffer = await buildWorkbookBuffer([
      { [F.ITEM_CATEGORY_CODE]: "01", [F.ITEM_CATEGORY_NAME]: "GIÀY DÉP" },
    ]);

    await service.validate(asFile(buffer), actor, "SKIP");
    expect(
      (savedRows[0] as { errorMessages: Array<{ code: string }> })
        .errorMessages,
    ).toEqual([expect.objectContaining({ code: "DUPLICATE_CATEGORY" })]);

    savedRows = [];
    await service.validate(asFile(buffer), actor, "UPDATE");
    const row = savedRows[0] as {
      status: ImportRowStatus;
      normalizedData: Record<string, unknown>;
    };
    expect(row.status).toBe(ImportRowStatus.VALID);
    expect(row.normalizedData.existingCategoryId).toBe("cat-1");
  });

  it("parses semicolon CSV with the category layout", async () => {
    const csv = [
      ";;;;",
      ";;;;",
      ";;;;",
      ";;;;",
      "DANH MỤC NHÓM HÀNG HÓA;;;;",
      ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER.join(";"),
      ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER.map(
        (k) => ITEM_CATEGORY_IMPORT_EXCEL_FIELD_LABELS[k],
      ).join(";"),
      '0102;"Giày; nhập";01;KCT',
    ].join("\r\n");

    const result = await service.validate(
      asFile(Buffer.from("﻿" + csv, "utf-8"), "nhom-hang.csv"),
      actor,
    );

    expect(result.job.status).toBe(ImportJobStatus.VALIDATED);
    const row = savedRows[0] as {
      rowNumber: number;
      normalizedData: Record<string, unknown>;
      warningMessages?: Array<{ code: string }>;
    };
    expect(row.rowNumber).toBe(8);
    expect(row.normalizedData).toMatchObject({
      code: "0102",
      name: "Giày; nhập",
    });
    // Parent "01" is not in the file nor DB → warning + root.
    expect(row.warningMessages).toEqual([
      expect.objectContaining({ code: "PARENT_NOT_FOUND" }),
    ]);
  });

  it("export workbook: hidden keys row + hidden TaxRate column + A2 note, and round-trips", async () => {
    const workbookService = new CategoryImportWorkbookService();
    const buffer = await workbookService.buildWorkbookBuffer([
      {
        [F.ITEM_CATEGORY_CODE]: "01",
        [F.ITEM_CATEGORY_NAME]: "GIÀY DÉP",
        [F.PARENT_NAME]: "",
        [F.TAX_RATE]: "",
      },
      {
        [F.ITEM_CATEGORY_CODE]: "0102",
        [F.ITEM_CATEGORY_NAME]: "Giày nhập",
        [F.PARENT_NAME]: "01",
        [F.TAX_RATE]: "",
      },
    ]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];
    expect(sheet.getRow(CATEGORY_KEYS_ROW).hidden).toBe(true);
    expect(sheet.getColumn(4).hidden).toBe(true);
    expect(String(sheet.getCell("A2").note ?? "")).toContain("Thuế GTGT");
    expect(sheet.getCell("A5").value).toBe("DANH MỤC NHÓM HÀNG HÓA");

    const result = await service.validate(asFile(buffer), actor);
    expect(result.job.status).toBe(ImportJobStatus.VALIDATED);
    expect(result.job.validRows).toBe(2);
    expect(result.job.errorRows).toBe(0);
    const child = savedRows[1] as { normalizedData: Record<string, unknown> };
    expect(child.normalizedData.parentCode).toBe("01");
  });
});
