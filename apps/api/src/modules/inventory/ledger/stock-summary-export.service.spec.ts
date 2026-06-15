import * as ExcelJS from "exceljs";
import {
  StockSummaryExportService,
  StockSummaryExportVariant,
} from "./stock-summary-export.service";

describe("StockSummaryExportService", () => {
  const summaryRows = [
    {
      itemId: "item-1",
      storageId: "storage-1",
      item: { id: "item-1", code: "SHOE-B-39", name: "Giày B 39", unit: "Đôi", brand: "Jack", isActive: true, categoryName: "Giày" },
      storage: { id: "storage-1", name: "Kho chính", branchId: "branch-1" },
      quantity: 3, openingQty: 1, inQty: 4, outQty: 2, transferOutQty: 1, incomingQty: 2, reservedQty: 0,
    },
    {
      itemId: "item-2",
      storageId: "storage-1",
      item: { id: "item-2", code: "SHOE-B-40", name: "Giày B 40", unit: "Đôi", brand: "Jack", isActive: true, categoryName: "Giày" },
      storage: { id: "storage-1", name: "Kho chính", branchId: "branch-1" },
      quantity: 5, openingQty: 2, inQty: 6, outQty: 3, transferOutQty: 0, incomingQty: 1, reservedQty: 0,
    },
  ];
  const summaryService = {
    getSummary: jest.fn().mockResolvedValue({
      data: summaryRows,
      total: 2,
      page: 1,
      pageSize: 200,
      totalQuantity: 8,
    }),
  };
  const itemRepo = {
    find: jest.fn().mockResolvedValue([
      { id: "item-1", productId: "product-1", product: { code: "SHOE-B", name: "Giày B" } },
      { id: "item-2", productId: "product-1", product: { code: "SHOE-B", name: "Giày B" } },
    ]),
  };
  const attrRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { item_id: "item-1", attribute_name: "Màu", value_label: "Đen" },
        { item_id: "item-1", attribute_name: "Size", value_label: "39" },
        { item_id: "item-2", attribute_name: "Màu", value_label: "Đen" },
        { item_id: "item-2", attribute_name: "Size", value_label: "40" },
      ]),
    }),
  };
  const branchRepo = {
    findOne: jest.fn().mockResolvedValue({
      name: "Main Branch",
      address: "1 Main Street",
      phone: "0900000000",
    }),
  };
  const service = new StockSummaryExportService(
    summaryService as never,
    itemRepo as never,
    attrRepo as never,
    branchRepo as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it.each([
    [StockSummaryExportVariant.MODEL_AND_VARIANTS, "Tên hàng hóa", 3],
    [StockSummaryExportVariant.VARIANTS, "Tên hàng hóa", 2],
    [StockSummaryExportVariant.SPLIT_ATTRIBUTES, "Tên mẫu mã", 2],
    [StockSummaryExportVariant.MODELS, "Tên hàng hóa", 1],
  ])("builds %s workbook", async (variant, nameHeader, expectedRows) => {
    const buffer = await service.exportBuffer(
      { variant, startDate: "2026-06-01", endDate: "2026-06-30" },
      { organizationId: "org-1", branchId: "branch-1" } as never,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];

    expect(sheet.name).toBe("Tổng hợp tồn kho");
    expect(sheet.getCell("A4").text).toBe("TỔNG HỢP TỒN KHO");
    expect(sheet.getCell("B7").text).toBe(nameHeader);
    expect(sheet.rowCount - 7).toBe(expectedRows);
  });

  it("aggregates model quantities per storage", async () => {
    const buffer = await service.exportBuffer(
      { variant: StockSummaryExportVariant.MODELS },
      { organizationId: "org-1", branchId: "branch-1" } as never,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];

    expect(sheet.getCell("A8").text).toBe("SHOE-B");
    expect(sheet.getCell("J8").value).toBe(8);
    expect(sheet.getCell("K8").value).toBe(3);
    expect(sheet.getCell("L8").value).toBe(10);
  });

  it("does not duplicate standalone items in model-and-variant export", async () => {
    itemRepo.find.mockResolvedValueOnce([
      { id: "item-1", code: "SHOE-B-39", name: "Giày B 39", productId: null },
      { id: "item-2", code: "SHOE-B-40", name: "Giày B 40", productId: null },
    ]);

    const buffer = await service.exportBuffer(
      { variant: StockSummaryExportVariant.MODEL_AND_VARIANTS },
      { organizationId: "org-1", branchId: "branch-1" } as never,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.worksheets[0].rowCount - 7).toBe(2);
  });
});
