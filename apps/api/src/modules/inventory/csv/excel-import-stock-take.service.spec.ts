import { BadRequestException } from "@nestjs/common";
import { StockTakeStatus } from "@erp/shared-interfaces";
import * as ExcelJS from "exceljs";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { StockTakeEntity } from "../stock-take/stock-take.entity";
import {
  ExcelImportStockTakeService,
  STOCK_TAKE_IMPORT_FIELDS,
} from "./excel-import-stock-take.service";

describe("ExcelImportStockTakeService", () => {
  const actor = {
    organizationId: "org-1",
    branchId: "branch-1",
    userId: "user-1",
  } as ActorContext;
  const stockTake = {
    id: "stock-take-1",
    status: StockTakeStatus.DRAFT,
    storageId: "storage-1",
    countByValue: true,
    lines: [],
  } as unknown as StockTakeEntity;

  const itemRepo = { findOne: jest.fn() };
  const locationRepo = { findOne: jest.fn() };
  const stockTakeService = {
    getById: jest.fn(),
    addLine: jest.fn(),
    updateLineCount: jest.fn(),
  };
  const service = new ExcelImportStockTakeService(
    itemRepo as never,
    locationRepo as never,
    stockTakeService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates an unsaved draft validation target without persisting a stock take", () => {
    expect(
      service.createDraftTarget({
        storageId: "storage-1",
        countByValue: true,
      }),
    ).toEqual(
      expect.objectContaining({
        storageId: "storage-1",
        countByValue: true,
        status: StockTakeStatus.DRAFT,
        lines: [],
      }),
    );
    expect(stockTakeService.getById).not.toHaveBeenCalled();
  });

  it("parses the grouped MISA stock-take workbook headers", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kiểm kê");
    sheet.addRow([
      { richText: [{ text: "Mã SKU " }, { text: "(*)" }] },
      "Vị trí",
      "Số lượng",
      "",
      "Giá trị",
      "",
      "Nguyên nhân",
    ]);
    sheet.addRow([
      "",
      "",
      "Theo sổ",
      { richText: [{ text: "Kiểm kê " }, { text: "(*)" }] },
      "Theo sổ",
      { richText: [{ text: "Kiểm kê " }, { text: "(*)" }] },
      "",
    ]);
    sheet.addRow(["SKU-1", "A01", "10", "9", "100", "90", "Lệch"]);
    sheet.addRow(["Tổng", "", "", "9", "", "90", ""]);
    sheet.addRow([]);
    sheet.addRow(["II. Các thành viên tham gia kiểm kê"]);
    sheet.addRow(["STT", "Họ tên", "", "Chức danh"]);
    sheet.addRow(["1", "Không phải SKU"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(service.parseWorkbook(buffer)).resolves.toEqual([
      {
        [STOCK_TAKE_IMPORT_FIELDS.SKU]: "SKU-1",
        [STOCK_TAKE_IMPORT_FIELDS.LOCATION]: "A01",
        [STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY]: "9",
        [STOCK_TAKE_IMPORT_FIELDS.COUNTED_VALUE]: "90",
        [STOCK_TAKE_IMPORT_FIELDS.REASON]: "Lệch",
      },
    ]);
  });

  it("parses flat CSV headers and silently identifies empty counts", () => {
    const rows = service.parseCsv(
      "Mã SKU,Vị trí,Số lượng kiểm kê,Giá trị kiểm kê,Nguyên nhân\nSKU-1,A01,,,",
    );

    expect(rows).toHaveLength(1);
    expect(service.isEmptyCountRow(rows[0], stockTake)).toBe(true);
  });

  it("validates SKU, storage location, and non-negative counts", async () => {
    itemRepo.findOne.mockResolvedValue(null);
    locationRepo.findOne.mockResolvedValue(null);

    await expect(
      service.validateRow(
        {
          [STOCK_TAKE_IMPORT_FIELDS.SKU]: "UNKNOWN",
          [STOCK_TAKE_IMPORT_FIELDS.LOCATION]: "OTHER",
          [STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY]: "-1",
          [STOCK_TAKE_IMPORT_FIELDS.COUNTED_VALUE]: "-2",
        },
        stockTake,
        actor,
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SKU_NOT_FOUND" }),
        expect.objectContaining({ code: "LOCATION_NOT_IN_STORAGE" }),
        expect.objectContaining({ code: "INVALID_QUANTITY" }),
        expect.objectContaining({ code: "INVALID_VALUE" }),
      ]),
    );
  });

  it("upserts an existing item-location line through StockTakeService", async () => {
    const target = {
      ...stockTake,
      lines: [{ id: "line-1", itemId: "item-1", locationId: "location-1" }],
    } as StockTakeEntity;
    itemRepo.findOne.mockResolvedValue({ id: "item-1", code: "SKU-1" });
    locationRepo.findOne.mockResolvedValue({
      id: "location-1",
      code: "A01",
      storageId: "storage-1",
    });

    await service.commitRow(
      {
        [STOCK_TAKE_IMPORT_FIELDS.SKU]: "SKU-1",
        [STOCK_TAKE_IMPORT_FIELDS.LOCATION]: "A01",
        [STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY]: "9",
        [STOCK_TAKE_IMPORT_FIELDS.COUNTED_VALUE]: "900",
        [STOCK_TAKE_IMPORT_FIELDS.REASON]: "Điều chỉnh",
      },
      target,
      actor,
    );

    expect(stockTakeService.addLine).not.toHaveBeenCalled();
    expect(stockTakeService.updateLineCount).toHaveBeenCalledWith(
      "stock-take-1",
      "line-1",
      {
        countedQty: 9,
        countedValue: 900,
        reason: "Điều chỉnh",
      },
      actor,
    );
  });

  it("rejects a non-draft import target", async () => {
    stockTakeService.getById.mockResolvedValue({
      ...stockTake,
      status: StockTakeStatus.POSTED,
    });

    await expect(service.loadDraftTarget("stock-take-1", actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
