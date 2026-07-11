import {
  CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER,
  CUSTOMER_IMPORT_EXCEL_FIELD_LABELS,
  CUSTOMER_IMPORT_EXCEL_TEMPLATE_VERSION,
  CustomerImportExcelField,
  CustomerStatus,
  ImportJobStatus,
} from "@erp/shared-interfaces";
import * as ExcelJS from "exceljs";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { ImportRowStatus } from "../../inventory/csv/inventory-import-job-row.entity";
import { CustomerImportService } from "./customer-import.service";
import { CustomerImportWorkbookService } from "./customer-import-workbook.service";

const actor = {
  organizationId: "org-1",
  branchId: "branch-1",
  userId: "user-1",
} as ActorContext;

const F = CustomerImportExcelField;

/** Builds a MISA-layout .xlsx buffer: marker / keys / title / labels / data. */
async function buildWorkbookBuffer(
  dataRows: Array<Partial<Record<CustomerImportExcelField, string>> | null>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Danh sách khách hàng");
  sheet.addRow([CUSTOMER_IMPORT_EXCEL_TEMPLATE_VERSION]);
  sheet.addRow(CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.map(String));
  sheet.addRow(["DANH MỤC KHÁCH HÀNG"]);
  sheet.addRow(
    CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.map(
      (key) => CUSTOMER_IMPORT_EXCEL_FIELD_LABELS[key],
    ),
  );
  for (const row of dataRows) {
    // `null` = blank sheet row (tests row-number bookkeeping around skips).
    sheet.addRow(
      row
        ? CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.map((key) => row[key] ?? "")
        : [],
    );
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function asFile(buffer: Buffer): Express.Multer.File {
  return { buffer, originalname: "DanhMucKhachHang.xlsx" } as Express.Multer.File;
}

/** Chainable query-builder stub returning `results()` from getMany. */
function queryBuilderStub(results: () => unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => results()),
  };
}

describe("CustomerImportService", () => {
  let savedRows: Array<Record<string, unknown>>;
  let existingCustomers: Array<Record<string, unknown>>;
  let existingCards: Array<Record<string, unknown>>;
  let existingProfiles: Array<Record<string, unknown>>;

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
  const customerRepo = {
    createQueryBuilder: jest.fn(() => queryBuilderStub(() => existingCustomers)),
  };
  const groupRepo = {};
  const cardRepo = {
    createQueryBuilder: jest.fn(() => queryBuilderStub(() => existingCards)),
  };
  const employeeProfileRepo = {
    createQueryBuilder: jest.fn(() => queryBuilderStub(() => existingProfiles)),
  };
  const dataSource = { transaction: jest.fn() };
  const docNumbering = { generate: jest.fn(async () => "KH000001") };
  const wsEmitter = { emitToOrg: jest.fn() };

  const service = new CustomerImportService(
    jobRepo as never,
    rowRepo as never,
    customerRepo as never,
    groupRepo as never,
    cardRepo as never,
    employeeProfileRepo as never,
    dataSource as never,
    docNumbering as never,
    new CustomerImportWorkbookService(),
    wsEmitter as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    savedRows = [];
    existingCustomers = [];
    existingCards = [];
    existingProfiles = [];
    jobRepo.findOne.mockResolvedValue(null);
  });

  it("validates a well-formed row as VALID and normalizes fields", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        [F.CUSTOMER_CODE]: "KH0001",
        [F.CUSTOMER_NAME]: "Nguyễn Văn A",
        [F.TEL]: "0901234567",
        [F.BIRTHDAY]: "25/12/1990",
        [F.GENDER]: "Nữ",
        [F.MEMBER_LEVEL_CODE]: "Vàng",
        [F.EMAIL]: "a@example.com",
      },
    ]);

    const result = await service.validate(asFile(buffer), actor);

    expect(result.job.status).toBe(ImportJobStatus.VALIDATED);
    expect(savedRows).toHaveLength(1);
    const row = savedRows[0] as {
      status: ImportRowStatus;
      rowNumber: number;
      normalizedData: Record<string, unknown>;
      warningMessages?: unknown[];
    };
    expect(row.status).toBe(ImportRowStatus.VALID);
    expect(row.rowNumber).toBe(5);
    expect(row.normalizedData).toMatchObject({
      code: "KH0001",
      name: "Nguyễn Văn A",
      phone: "0901234567",
      birthDate: "1990-12-25",
      gender: "female",
      tier: "gold",
      email: "a@example.com",
    });
    expect(row.warningMessages).toBeUndefined();
  });

  it("marks rows missing name or phone as ERROR", async () => {
    const buffer = await buildWorkbookBuffer([
      { [F.CUSTOMER_NAME]: "Thiếu SĐT" },
      { [F.CUSTOMER_CODE]: "KH0002", [F.TEL]: "0900000002" },
    ]);

    const result = await service.validate(asFile(buffer), actor);

    expect(result.job.status).toBe(ImportJobStatus.FAILED);
    const [noPhone, noName] = savedRows as Array<{
      status: ImportRowStatus;
      errorMessages: Array<{ column?: string; code: string }>;
    }>;
    expect(noPhone.status).toBe(ImportRowStatus.ERROR);
    expect(noPhone.errorMessages).toEqual([
      expect.objectContaining({ column: F.TEL, code: "REQUIRED" }),
    ]);
    expect(noName.status).toBe(ImportRowStatus.ERROR);
    expect(noName.errorMessages).toEqual([
      expect.objectContaining({ column: F.CUSTOMER_NAME, code: "REQUIRED" }),
    ]);
  });

  it("keeps rows VALID with warnings for unknown gender/tier and bad dates", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        [F.CUSTOMER_NAME]: "Khách B",
        [F.TEL]: "0900000003",
        [F.GENDER]: "Khác",
        [F.MEMBER_LEVEL_CODE]: "Bạch kim",
        [F.BIRTHDAY]: "31/02/2000",
      },
    ]);

    await service.validate(asFile(buffer), actor);

    const row = savedRows[0] as {
      status: ImportRowStatus;
      normalizedData: Record<string, unknown>;
      warningMessages: Array<{ code: string }>;
    };
    expect(row.status).toBe(ImportRowStatus.VALID);
    expect(row.warningMessages.map((w) => w.code).sort()).toEqual([
      "DATE_INVALID",
      "GENDER_UNRECOGNIZED",
      "MEMBER_LEVEL_UNRECOGNIZED",
    ]);
    expect(row.normalizedData.gender).toBeUndefined();
    expect(row.normalizedData.tier).toBeUndefined();
    expect(row.normalizedData.birthDate).toBeUndefined();
  });

  it("rejects duplicate codes and phones within the file", async () => {
    const buffer = await buildWorkbookBuffer([
      { [F.CUSTOMER_CODE]: "KH01", [F.CUSTOMER_NAME]: "A", [F.TEL]: "0900000004" },
      { [F.CUSTOMER_CODE]: "KH01", [F.CUSTOMER_NAME]: "B", [F.TEL]: "0900000004" },
    ]);

    await service.validate(asFile(buffer), actor);

    const second = savedRows[1] as {
      status: ImportRowStatus;
      errorMessages: Array<{ code: string }>;
    };
    expect(second.status).toBe(ImportRowStatus.ERROR);
    expect(second.errorMessages.map((e) => e.code).sort()).toEqual([
      "DUPLICATE_IN_FILE",
      "DUPLICATE_IN_FILE",
    ]);
  });

  it("reports the real sheet row numbers when blank rows are skipped", async () => {
    const buffer = await buildWorkbookBuffer([
      { [F.CUSTOMER_CODE]: "KH01", [F.CUSTOMER_NAME]: "A", [F.TEL]: "0900000010" },
      null, // blank sheet row 6
      { [F.CUSTOMER_CODE]: "KH02", [F.CUSTOMER_NAME]: "B", [F.TEL]: "0900000011" },
    ]);

    await service.validate(asFile(buffer), actor);

    expect(
      (savedRows as Array<{ rowNumber: number }>).map((r) => r.rowNumber),
    ).toEqual([5, 7]);
  });

  it("SKIP mode rejects existing codes; UPDATE mode targets the existing customer", async () => {
    existingCustomers = [
      {
        id: "cust-1",
        code: "KH01",
        phone: "0900000005",
        email: undefined,
        status: CustomerStatus.ACTIVE,
      },
    ];
    const buffer = await buildWorkbookBuffer([
      { [F.CUSTOMER_CODE]: "KH01", [F.CUSTOMER_NAME]: "A", [F.TEL]: "0900000005" },
    ]);

    await service.validate(asFile(buffer), actor, "SKIP");
    const skipRow = savedRows[0] as {
      status: ImportRowStatus;
      errorMessages: Array<{ code: string }>;
    };
    expect(skipRow.status).toBe(ImportRowStatus.ERROR);
    expect(skipRow.errorMessages).toEqual([
      expect.objectContaining({ code: "DUPLICATE_CUSTOMER" }),
    ]);

    savedRows = [];
    await service.validate(asFile(buffer), actor, "UPDATE");
    const updateRow = savedRows[0] as {
      status: ImportRowStatus;
      normalizedData: Record<string, unknown>;
    };
    expect(updateRow.status).toBe(ImportRowStatus.VALID);
    expect(updateRow.normalizedData.existingCustomerId).toBe("cust-1");
  });

  it("rejects updates targeting a MERGED customer in both modes", async () => {
    existingCustomers = [
      {
        id: "cust-2",
        code: "KH09",
        phone: "0900000009",
        email: undefined,
        status: CustomerStatus.MERGED,
      },
    ];
    const buffer = await buildWorkbookBuffer([
      { [F.CUSTOMER_CODE]: "KH09", [F.CUSTOMER_NAME]: "A", [F.TEL]: "0900000009" },
    ]);

    await service.validate(asFile(buffer), actor, "UPDATE");

    const row = savedRows[0] as {
      status: ImportRowStatus;
      errorMessages: Array<{ code: string }>;
    };
    expect(row.status).toBe(ImportRowStatus.ERROR);
    expect(row.errorMessages).toEqual([
      expect.objectContaining({ code: "CUSTOMER_MERGED" }),
    ]);
  });

  it("rejects a phone owned by a different customer", async () => {
    existingCustomers = [
      {
        id: "cust-9",
        code: "KH99",
        phone: "0911111111",
        email: undefined,
        status: CustomerStatus.ACTIVE,
      },
    ];
    const buffer = await buildWorkbookBuffer([
      { [F.CUSTOMER_CODE]: "KH01", [F.CUSTOMER_NAME]: "A", [F.TEL]: "0911111111" },
    ]);

    await service.validate(asFile(buffer), actor, "UPDATE");

    const row = savedRows[0] as {
      status: ImportRowStatus;
      errorMessages: Array<{ code: string }>;
    };
    expect(row.status).toBe(ImportRowStatus.ERROR);
    expect(row.errorMessages).toEqual([
      expect.objectContaining({ code: "PHONE_TAKEN" }),
    ]);
  });

  it("keeps only the first of duplicate card numbers within the file", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        [F.CUSTOMER_NAME]: "A",
        [F.TEL]: "0900000012",
        [F.MEMBER_CARD_NO]: "CARD01",
      },
      {
        [F.CUSTOMER_NAME]: "B",
        [F.TEL]: "0900000013",
        [F.MEMBER_CARD_NO]: "CARD01",
      },
    ]);

    await service.validate(asFile(buffer), actor);

    const [first, second] = savedRows as Array<{
      status: ImportRowStatus;
      normalizedData: Record<string, unknown>;
      warningMessages?: Array<{ code: string }>;
    }>;
    expect(first.normalizedData.cardNumber).toBe("CARD01");
    expect(second.status).toBe(ImportRowStatus.VALID);
    expect(second.normalizedData.cardNumber).toBeUndefined();
    expect(second.warningMessages).toEqual([
      expect.objectContaining({ code: "CARD_DUPLICATE_IN_FILE" }),
    ]);
  });

  it("rejects group codes longer than the column limit", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        [F.CUSTOMER_NAME]: "A",
        [F.TEL]: "0900000014",
        [F.CUSTOMER_CATEGORY_CODE]: "X".repeat(51),
      },
    ]);

    await service.validate(asFile(buffer), actor);

    const row = savedRows[0] as {
      status: ImportRowStatus;
      errorMessages: Array<{ column?: string; code: string }>;
    };
    expect(row.status).toBe(ImportRowStatus.ERROR);
    expect(row.errorMessages).toEqual([
      expect.objectContaining({
        column: F.CUSTOMER_CATEGORY_CODE,
        code: "TOO_LONG",
      }),
    ]);
  });

  it("resolves employee codes and warns on misses", async () => {
    existingProfiles = [{ code: "NV000001", userId: "user-9" }];
    const buffer = await buildWorkbookBuffer([
      {
        [F.CUSTOMER_NAME]: "A",
        [F.TEL]: "0900000006",
        [F.EMPLOYEE_CODE]: "NV000001",
      },
      {
        [F.CUSTOMER_NAME]: "B",
        [F.TEL]: "0900000007",
        [F.EMPLOYEE_CODE]: "NV404",
      },
    ]);

    await service.validate(asFile(buffer), actor);

    const [hit, miss] = savedRows as Array<{
      status: ImportRowStatus;
      normalizedData: Record<string, unknown>;
      warningMessages?: Array<{ code: string }>;
    }>;
    expect(hit.normalizedData.assignedStaffId).toBe("user-9");
    expect(miss.status).toBe(ImportRowStatus.VALID);
    expect(miss.warningMessages).toEqual([
      expect.objectContaining({ code: "EMPLOYEE_NOT_FOUND" }),
    ]);
  });

  it("parses semicolon-delimited CSV with the MISA layout", async () => {
    const csv = [
      "MS_007;;;;;;;;;;;;;;;;;;;;",
      CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.join(";"),
      "DANH MỤC KHÁCH HÀNG;;;;;;;;;;;;;;;;;;;;",
      CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.map(
        (k) => CUSTOMER_IMPORT_EXCEL_FIELD_LABELS[k],
      ).join(";"),
      'KHCSV01;"Nguyễn; CSV";;0912000001;;;05/01/1985;Nam;;;;;;;"12 Lê Lợi; Q1";;;;;;',
    ].join("\r\n");
    const file = {
      buffer: Buffer.from("﻿" + csv, "utf-8"),
      originalname: "khach-hang.csv",
    } as Express.Multer.File;

    const result = await service.validate(file, actor);

    expect(result.job.status).toBe(ImportJobStatus.VALIDATED);
    const row = savedRows[0] as {
      status: ImportRowStatus;
      rowNumber: number;
      normalizedData: Record<string, unknown>;
    };
    expect(row.status).toBe(ImportRowStatus.VALID);
    expect(row.rowNumber).toBe(5);
    expect(row.normalizedData).toMatchObject({
      code: "KHCSV01",
      name: "Nguyễn; CSV",
      phone: "0912000001",
      birthDate: "1985-01-05",
      gender: "male",
      address: "12 Lê Lợi; Q1",
    });
  });

  it("parses comma-delimited CSV and tolerates a missing marker row", async () => {
    const csv = [
      CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.join(","),
      "DANH MỤC KHÁCH HÀNG",
      CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.map(
        (k) => CUSTOMER_IMPORT_EXCEL_FIELD_LABELS[k],
      ).join(","),
      'KHCSV02,"Trần, CSV",,0912000002,,,,,,,,,,,"5 Hai Bà Trưng, Q3",,,,,,',
    ].join("\n");
    const file = {
      buffer: Buffer.from(csv, "utf-8"),
      originalname: "export.CSV",
    } as Express.Multer.File;

    const result = await service.validate(file, actor);

    expect(result.job.status).toBe(ImportJobStatus.VALIDATED);
    const row = savedRows[0] as {
      status: ImportRowStatus;
      rowNumber: number;
      normalizedData: Record<string, unknown>;
    };
    expect(row.status).toBe(ImportRowStatus.VALID);
    expect(row.rowNumber).toBe(4);
    expect(row.normalizedData).toMatchObject({
      code: "KHCSV02",
      name: "Trần, CSV",
      phone: "0912000002",
      address: "5 Hai Bà Trưng, Q3",
    });
  });

  it("round-trips a workbook produced by CustomerImportWorkbookService", async () => {
    const workbookService = new CustomerImportWorkbookService();
    const buffer = await workbookService.buildWorkbookBuffer([
      {
        [F.CUSTOMER_CODE]: "KH0001",
        [F.CUSTOMER_NAME]: "Nguyễn Văn A",
        [F.TEL]: "0901234567",
        [F.GENDER]: "Nam",
        [F.MEMBER_LEVEL_CODE]: "Bạc",
      },
    ]);

    const result = await service.validate(asFile(buffer), actor);

    expect(result.job.status).toBe(ImportJobStatus.VALIDATED);
    const row = savedRows[0] as {
      status: ImportRowStatus;
      normalizedData: Record<string, unknown>;
    };
    expect(row.status).toBe(ImportRowStatus.VALID);
    expect(row.normalizedData).toMatchObject({
      code: "KH0001",
      gender: "male",
      tier: "silver",
    });
  });
});
