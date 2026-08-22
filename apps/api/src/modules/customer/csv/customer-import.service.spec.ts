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
import {
  ImportRowStatus,
  InventoryImportJobRowEntity,
} from "../../inventory/csv/inventory-import-job-row.entity";
import { CustomerEntity } from "../customer.entity";
import { MembershipCardEntity } from "../membership-card.entity";
import { PointHistoryEntity } from "../point-history.entity";
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
  columns: CustomerImportExcelField[] = CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Danh sách khách hàng");
  sheet.addRow([CUSTOMER_IMPORT_EXCEL_TEMPLATE_VERSION]);
  sheet.addRow(columns.map(String));
  sheet.addRow(["DANH MỤC KHÁCH HÀNG"]);
  sheet.addRow(columns.map((key) => CUSTOMER_IMPORT_EXCEL_FIELD_LABELS[key]));
  for (const row of dataRows) {
    // `null` = blank sheet row (tests row-number bookkeeping around skips).
    sheet.addRow(row ? columns.map((key) => row[key] ?? "") : []);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Renders one CSV data line in template column order, quoting as needed. */
function csvDataLine(
  row: Partial<Record<CustomerImportExcelField, string>>,
  delimiter: string,
): string {
  return CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.map((key) => {
    const value = row[key] ?? "";
    return value.includes(delimiter) ? `"${value}"` : value;
  }).join(delimiter);
}

/** Pads a single-cell row out to the template width, e.g. `MS_007;;;…`. */
function csvPaddedLine(firstCell: string, delimiter: string): string {
  return (
    firstCell +
    delimiter.repeat(CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.length - 1)
  );
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
  const customerCode = { issue: jest.fn(async () => "KH000001") };
  const wsEmitter = { emitToOrg: jest.fn() };

  const service = new CustomerImportService(
    jobRepo as never,
    rowRepo as never,
    customerRepo as never,
    groupRepo as never,
    cardRepo as never,
    employeeProfileRepo as never,
    dataSource as never,
    customerCode as never,
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
      csvPaddedLine("MS_007", ";"),
      CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.join(";"),
      csvPaddedLine("DANH MỤC KHÁCH HÀNG", ";"),
      CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.map(
        (k) => CUSTOMER_IMPORT_EXCEL_FIELD_LABELS[k],
      ).join(";"),
      csvDataLine(
        {
          [F.CUSTOMER_CODE]: "KHCSV01",
          [F.CUSTOMER_NAME]: "Nguyễn; CSV",
          [F.TEL]: "0912000001",
          [F.BIRTHDAY]: "05/01/1985",
          [F.GENDER]: "Nam",
          [F.ADDRESS]: "12 Lê Lợi; Q1",
        },
        ";",
      ),
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
      csvDataLine(
        {
          [F.CUSTOMER_CODE]: "KHCSV02",
          [F.CUSTOMER_NAME]: "Trần, CSV",
          [F.TEL]: "0912000002",
          [F.ADDRESS]: "5 Hai Bà Trưng, Q3",
        },
        ",",
      ),
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

  describe("Points commit", () => {
    /**
     * Drives commit() over one batch. `cards` are the membership cards already
     * in the DB, keyed by customerId. Returns the point_history rows written
     * and how many INSERT calls it took.
     */
    async function commitRows(
      normalizedRows: Array<Record<string, unknown>>,
      cards: Array<{ id: string; customerId: string; points: number }> = [],
    ) {
      jobRepo.findOne.mockResolvedValue({
        id: "job-1",
        status: ImportJobStatus.VALIDATED,
        validRows: normalizedRows.length,
      });
      rowRepo.find.mockResolvedValue(
        normalizedRows.map((normalizedData, index) => ({
          id: `row-${index}`,
          normalizedData,
        })),
      );

      const savedCards: Array<Record<string, unknown>> = [];
      const pointInserts: Array<Array<Record<string, unknown>>> = [];
      const em = {
        getRepository: (entity: unknown) => {
          if (entity === PointHistoryEntity) {
            return {
              insert: jest.fn(async (rows: Array<Record<string, unknown>>) => {
                pointInserts.push(rows);
              }),
            };
          }
          if (entity === MembershipCardEntity) {
            return {
              findOne: jest.fn(
                async ({ where }: { where: { customerId: string } }) =>
                  cards.find((c) => c.customerId === where.customerId) ?? null,
              ),
              create: jest.fn((data: object) => ({ id: "card-new", ...data })),
              save: jest.fn(async (card: Record<string, unknown>) => {
                savedCards.push(card);
                return card;
              }),
            };
          }
          if (entity === CustomerEntity) {
            return {
              update: jest.fn(),
              create: jest.fn((data: object) => ({ id: "cust-new", ...data })),
              save: jest.fn(async (c: Record<string, unknown>) => c),
            };
          }
          if (entity === InventoryImportJobRowEntity) {
            return { update: jest.fn() };
          }
          throw new Error(`unexpected repository request`);
        },
      };
      dataSource.transaction.mockImplementation(
        async (cb: (em: unknown) => Promise<void>) => cb(em),
      );

      await service.commit("job-1", actor);
      return { pointInserts, savedCards };
    }

    it("sets an absolute balance on a new customer and logs the full amount", async () => {
      const { pointInserts, savedCards } = await commitRows([
        { name: "A", phone: "0900000020", points: 500 },
      ]);

      expect(savedCards[0]).toMatchObject({ points: 500 });
      expect(pointInserts).toHaveLength(1);
      expect(pointInserts[0]).toEqual([
        expect.objectContaining({ cardId: "card-new", type: "adjust", delta: 500 }),
      ]);
    });

    it.each([
      [300, 500, 200],
      [500, 300, -200],
    ])(
      "logs the delta when balance %i becomes %i",
      async (current, imported, expectedDelta) => {
        const { pointInserts, savedCards } = await commitRows(
          [
            {
              name: "A",
              phone: "0900000021",
              points: imported,
              existingCustomerId: "cust-1",
            },
          ],
          [{ id: "card-1", customerId: "cust-1", points: current }],
        );

        expect(savedCards[0]).toMatchObject({ points: imported });
        expect(pointInserts[0]).toEqual([
          expect.objectContaining({ cardId: "card-1", delta: expectedDelta }),
        ]);
      },
    );

    it("writes no ledger row when the balance is unchanged", async () => {
      const { pointInserts } = await commitRows(
        [
          {
            name: "A",
            phone: "0900000022",
            points: 300,
            existingCustomerId: "cust-1",
          },
        ],
        [{ id: "card-1", customerId: "cust-1", points: 300 }],
      );

      expect(pointInserts).toHaveLength(0);
    });

    it("leaves the card untouched when the Points cell is empty", async () => {
      const { pointInserts, savedCards } = await commitRows(
        [{ name: "A", phone: "0900000023", existingCustomerId: "cust-1" }],
        [{ id: "card-1", customerId: "cust-1", points: 300 }],
      );

      expect(savedCards).toHaveLength(0);
      expect(pointInserts).toHaveLength(0);
    });

    it("writes the whole batch in a single INSERT", async () => {
      const { pointInserts } = await commitRows(
        [
          { name: "A", phone: "0900000024", points: 10, existingCustomerId: "c1" },
          { name: "B", phone: "0900000025", points: 20, existingCustomerId: "c2" },
          { name: "C", phone: "0900000026", points: 30, existingCustomerId: "c3" },
        ],
        [
          { id: "card-1", customerId: "c1", points: 0 },
          { id: "card-2", customerId: "c2", points: 0 },
          { id: "card-3", customerId: "c3", points: 0 },
        ],
      );

      expect(pointInserts).toHaveLength(1);
      expect(pointInserts[0]).toHaveLength(3);
    });
  });

  describe("Points column", () => {
    it("normalizes an integer balance and accepts grouped digits", async () => {
      const buffer = await buildWorkbookBuffer([
        { [F.CUSTOMER_NAME]: "A", [F.TEL]: "0900000010", [F.POINTS]: "500" },
        { [F.CUSTOMER_NAME]: "B", [F.TEL]: "0900000011", [F.POINTS]: "1.000" },
      ]);

      await service.validate(asFile(buffer), actor);

      expect(
        (savedRows[0] as { normalizedData: Record<string, unknown> })
          .normalizedData.points,
      ).toBe(500);
      expect(
        (savedRows[1] as { normalizedData: Record<string, unknown> })
          .normalizedData.points,
      ).toBe(1000);
    });

    it.each(["abc", "-50"])(
      "warns and drops the column for %s, keeping the row VALID",
      async (raw) => {
        const buffer = await buildWorkbookBuffer([
          { [F.CUSTOMER_NAME]: "A", [F.TEL]: "0900000012", [F.POINTS]: raw },
        ]);

        await service.validate(asFile(buffer), actor);

        const row = savedRows[0] as {
          status: ImportRowStatus;
          normalizedData: Record<string, unknown>;
          warningMessages: Array<{ code: string }>;
        };
        expect(row.status).toBe(ImportRowStatus.VALID);
        expect(row.warningMessages.map((w) => w.code)).toContain(
          "POINTS_INVALID",
        );
        expect(row.normalizedData.points).toBeUndefined();
      },
    );

    it("still imports a legacy 21-column file that has no Points key", async () => {
      const legacyColumns = CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.filter(
        (key) => key !== F.POINTS,
      );
      const buffer = await buildWorkbookBuffer(
        [
          {
            [F.CUSTOMER_NAME]: "Khách cũ",
            [F.TEL]: "0900000013",
            [F.IDENTIFY_NUMBER]: "012345678901",
            [F.ADDRESS]: "12 Lê Lợi",
          },
        ],
        legacyColumns,
      );

      await service.validate(asFile(buffer), actor);

      const row = savedRows[0] as {
        status: ImportRowStatus;
        normalizedData: Record<string, unknown>;
      };
      expect(row.status).toBe(ImportRowStatus.VALID);
      expect(row.normalizedData.points).toBeUndefined();
      // Columns after the inserted position must still land on the right field.
      expect(row.normalizedData).toMatchObject({
        nationalId: "012345678901",
        address: "12 Lê Lợi",
      });
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
        [F.POINTS]: "1250",
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
      points: 1250,
    });
  });
});
