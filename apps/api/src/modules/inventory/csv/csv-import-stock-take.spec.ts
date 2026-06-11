import { ImportJobStatus } from "@erp/shared-interfaces";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { CsvImportService } from "./csv-import.service";
import { ImportJobType } from "./inventory-import-job.entity";
import { STOCK_TAKE_IMPORT_FIELDS } from "./excel-import-stock-take.service";

describe("CsvImportService STOCK_TAKE validation", () => {
  const actor = {
    organizationId: "org-1",
    branchId: "branch-1",
    userId: "user-1",
  } as ActorContext;

  it("scopes idempotency to referenceId and silently skips empty counts", async () => {
    const savedRows: unknown[] = [];
    const jobRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: "job-1", ...value })),
    };
    const rowRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (rows) => {
        savedRows.push(...rows);
        return rows;
      }),
      count: jest.fn().mockResolvedValue(1),
      find: jest.fn().mockImplementation(async () => savedRows),
    };
    const stockTakeImporter = {
      loadDraftTarget: jest.fn().mockResolvedValue({
        id: "stock-take-1",
        storageId: "storage-1",
        countByValue: false,
      }),
      parseCsv: jest.fn().mockReturnValue([
        {
          [STOCK_TAKE_IMPORT_FIELDS.SKU]: "SKIP",
          [STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY]: "",
        },
        {
          [STOCK_TAKE_IMPORT_FIELDS.SKU]: "SKU-1",
          [STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY]: "5",
        },
      ]),
      isEmptyCountRow: jest.fn((row) => !row[STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY]),
      validateRow: jest.fn().mockResolvedValue([]),
    };
    const service = new CsvImportService(
      jobRepo as never,
      rowRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emitToOrg: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      stockTakeImporter as never,
    );

    const result = await service.validate(
      ImportJobType.STOCK_TAKE,
      {
        originalname: "kiem-ke.csv",
        buffer: Buffer.from("content"),
      } as Express.Multer.File,
      actor,
      undefined,
      "stock-take-1",
    );

    expect(jobRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: "stock-take-1",
        idempotencyKey: expect.stringContaining(
          ":STOCK_TAKE:stock-take-1:",
        ),
      }),
    );
    expect(result.job).toEqual(
      expect.objectContaining({
        status: ImportJobStatus.VALIDATED,
        totalRows: 1,
        validRows: 1,
        errorRows: 0,
      }),
    );
    expect(savedRows).toHaveLength(1);
  });
});
