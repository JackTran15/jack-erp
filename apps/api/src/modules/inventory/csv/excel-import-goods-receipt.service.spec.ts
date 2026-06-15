import * as ExcelJS from "exceljs";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import {
  ExcelImportGoodsReceiptService,
  GOODS_RECEIPT_IMPORT_FIELDS,
} from "./excel-import-goods-receipt.service";

describe("ExcelImportGoodsReceiptService", () => {
  const actor = {
    organizationId: "org-1",
    branchId: "branch-1",
    userId: "user-1",
  } as ActorContext;
  const itemRepo = { findOne: jest.fn() };
  const barcodeRepo = { findOne: jest.fn() };
  const storageRepo = { findOne: jest.fn() };
  const locationRepo = { findOne: jest.fn() };
  const service = new ExcelImportGoodsReceiptService(
    itemRepo as never,
    barcodeRepo as never,
    storageRepo as never,
    locationRepo as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parses a MISA-style receipt workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Danh sách hàng hóa nhập kho");
    sheet.addRow(["DANH SÁCH HÀNG HÓA NHẬP KHO"]);
    sheet.addRow([]);
    sheet.addRow([
      "Mã SKU (*)",
      "Mã vạch (*)",
      "Tên hàng hóa",
      "Đơn vị tính",
      "Kho",
      "Vị trí",
      "Số lượng",
      "Đơn giá",
      "Thành tiền",
      "Ghi chú",
    ]);
    sheet.addRow(["SKU-1", "", "Áo", "Cái", "Kho chính", "A01", 2, 15000, 30000, "Mới"]);

    const rows = await service.parseWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        [GOODS_RECEIPT_IMPORT_FIELDS.SKU]: "SKU-1",
        [GOODS_RECEIPT_IMPORT_FIELDS.STORAGE]: "Kho chính",
        [GOODS_RECEIPT_IMPORT_FIELDS.QUANTITY]: "2",
        [GOODS_RECEIPT_IMPORT_FIELDS.UNIT_PRICE]: "15000",
      }),
    ]);
  });

  it("parses MISA headers when the file identifies items by barcode only", () => {
    const rows = service.parseCsv(
      [
        "Mã vạch (*),Kho,Vị trí,Số lượng",
        "8930001,Kho chính,A01,2",
      ].join("\n"),
    );

    expect(rows).toEqual([
      {
        [GOODS_RECEIPT_IMPORT_FIELDS.BARCODE]: "8930001",
        [GOODS_RECEIPT_IMPORT_FIELDS.STORAGE]: "Kho chính",
        [GOODS_RECEIPT_IMPORT_FIELDS.LOCATION]: "A01",
        [GOODS_RECEIPT_IMPORT_FIELDS.QUANTITY]: "2",
      },
    ]);
  });

  it("reports that both item identity columns are missing", () => {
    expect(() =>
      service.parseCsv(
        [
          "Tên hàng hóa,Kho,Vị trí,Số lượng",
          "Áo,Kho chính,A01,2",
        ].join("\n"),
      ),
    ).toThrow('Tệp nhập kho không có cột "Mã SKU" hoặc "Mã vạch"');
  });

  it("validates and normalizes a valid row with the default purchase price", async () => {
    itemRepo.findOne.mockResolvedValue({
      id: "item-1",
      code: "SKU-1",
      name: "Áo",
      unit: "Cái",
      purchasePrice: "25000",
    });
    storageRepo.findOne.mockResolvedValue({
      id: "storage-1",
      name: "Kho chính",
    });
    locationRepo.findOne.mockResolvedValue({
      id: "location-1",
      code: "A01",
      name: "Kệ A01",
      storageId: "storage-1",
    });

    const result = await service.validateAndNormalizeRow(
      {
        [GOODS_RECEIPT_IMPORT_FIELDS.SKU]: "SKU-1",
        [GOODS_RECEIPT_IMPORT_FIELDS.UNIT]: "Cái",
        [GOODS_RECEIPT_IMPORT_FIELDS.STORAGE]: "Kho chính",
        [GOODS_RECEIPT_IMPORT_FIELDS.LOCATION]: "A01",
        [GOODS_RECEIPT_IMPORT_FIELDS.QUANTITY]: "2",
        [GOODS_RECEIPT_IMPORT_FIELDS.UNIT_PRICE]: "",
        [GOODS_RECEIPT_IMPORT_FIELDS.NOTE]: "Mới",
      },
      actor,
    );

    expect(result.errors).toEqual([]);
    expect(result.normalizedData).toEqual({
      itemId: "item-1",
      itemCode: "SKU-1",
      itemName: "Áo",
      unit: "Cái",
      storageId: "storage-1",
      storageName: "Kho chính",
      locationId: "location-1",
      locationCode: "A01",
      locationName: "Kệ A01",
      quantity: 2,
      unitPrice: 25000,
      note: "Mới",
    });
  });

  it("resolves by barcode and warns when price defaults to zero", async () => {
    barcodeRepo.findOne.mockResolvedValue({ itemId: "item-1" });
    itemRepo.findOne.mockResolvedValue({
      id: "item-1",
      code: "SKU-1",
      name: "Áo",
      unit: "Cái",
      purchasePrice: "0",
    });
    storageRepo.findOne.mockResolvedValue({ id: "storage-1", name: "Kho chính" });
    locationRepo.findOne.mockResolvedValue({
      id: "location-1",
      code: "A01",
      name: "Kệ A01",
      storageId: "storage-1",
    });

    const result = await service.validateAndNormalizeRow(
      {
        [GOODS_RECEIPT_IMPORT_FIELDS.BARCODE]: "8930001",
        [GOODS_RECEIPT_IMPORT_FIELDS.STORAGE]: "Kho chính",
        [GOODS_RECEIPT_IMPORT_FIELDS.LOCATION]: "A01",
        [GOODS_RECEIPT_IMPORT_FIELDS.QUANTITY]: "1",
      },
      actor,
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "MISSING_PURCHASE_PRICE" }),
    ]);
    expect(result.normalizedData?.unitPrice).toBe(0);
  });

  it("rejects invalid item, warehouse, location, quantity, price, unit, and note", async () => {
    itemRepo.findOne.mockResolvedValue(null);
    storageRepo.findOne.mockResolvedValue(null);

    const result = await service.validateAndNormalizeRow(
      {
        [GOODS_RECEIPT_IMPORT_FIELDS.SKU]: "UNKNOWN",
        [GOODS_RECEIPT_IMPORT_FIELDS.UNIT]: "Hộp",
        [GOODS_RECEIPT_IMPORT_FIELDS.STORAGE]: "Kho khác",
        [GOODS_RECEIPT_IMPORT_FIELDS.LOCATION]: "B01",
        [GOODS_RECEIPT_IMPORT_FIELDS.QUANTITY]: "0",
        [GOODS_RECEIPT_IMPORT_FIELDS.UNIT_PRICE]: "-1",
        [GOODS_RECEIPT_IMPORT_FIELDS.NOTE]: "x".repeat(501),
      },
      actor,
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ITEM_NOT_FOUND" }),
        expect.objectContaining({ code: "STORAGE_NOT_FOUND" }),
        expect.objectContaining({ code: "INVALID_QUANTITY" }),
        expect.objectContaining({ code: "INVALID_UNIT_PRICE" }),
        expect.objectContaining({ code: "NOTE_TOO_LONG" }),
      ]),
    );
  });

  it("builds a downloadable receipt template", async () => {
    const buffer = await service.buildTemplateBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];

    expect(sheet.name).toBe("Danh sách hàng hóa nhập kho");
    expect(sheet.getCell("A6").text).toBe("Mã SKU");
    expect(sheet.getCell("J6").text).toBe("Ghi chú");
    await expect(service.parseWorkbook(buffer)).resolves.toEqual([]);
  });
});
