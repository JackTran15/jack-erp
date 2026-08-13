import * as ExcelJS from "exceljs";
import {
  StockSummaryExportService,
  StockSummaryExportVariant,
} from "./stock-summary-export.service";
import { StockSummaryRow } from "./stock-summary.service";

const ORG = "e60e5f49-304d-4eb1-9735-3a2d10ba288f";
const STORAGE = "edbf4f08-6424-40de-9430-4d9c464187e4";

/**
 * Dựng lại đúng ca lỗi trên prod: phiếu nhập bị huỷ 2 lần khiến
 * stock_balances.quantity = 0, nhưng query theo kỳ (đã loại chứng từ huỷ) cho
 * closingQty = 1 — con số UI hiển thị.
 */
function createRow(overrides: Partial<StockSummaryRow> = {}): StockSummaryRow {
  return {
    itemId: "63178691-8c23-4291-bd8c-6d98b8efe03f",
    storageId: STORAGE,
    item: {
      id: "63178691-8c23-4291-bd8c-6d98b8efe03f",
      code: "ABA3335-D-40",
      name: "Sapo nam ABA3335-D-40",
      unit: "Đôi",
      brand: "Giày MT",
      isActive: true,
      categoryName: "Sapo nam",
    },
    storage: { id: STORAGE, name: "Showroom BMT", branchId: "branch-1" },
    quantity: 0,
    lastMovementAt: null,
    openingQty: 0,
    openingValue: 0,
    inQty: 1,
    inValue: 0,
    outQty: 0,
    outValue: 0,
    closingQty: 1,
    closingValue: 0,
    transferOutQty: 0,
    incomingQty: 0,
    reservedQty: 0,
    ...overrides,
  } as StockSummaryRow;
}

function createService(rows: StockSummaryRow[], hasProduct = false) {
  const summaryService = {
    getSummary: jest
      .fn()
      .mockResolvedValue({ data: rows, total: rows.length }),
  };
  const itemRepo = {
    find: jest.fn().mockResolvedValue(
      rows.map((row) => ({
        id: row.itemId,
        code: row.item.code,
        name: row.item.name,
        productId: hasProduct ? "product-1" : null,
        product: hasProduct
          ? { code: "ABA3335", name: "Sapo nam ABA3335" }
          : null,
      })),
    ),
  };
  const attrRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };
  const branchRepo = { findOne: jest.fn().mockResolvedValue(null) };
  return new StockSummaryExportService(
    summaryService as never,
    itemRepo as never,
    attrRepo as never,
    branchRepo as never,
  );
}

/** Đọc lại workbook đã xuất, trả về [mã SKU, số lượng tồn] của từng dòng. */
async function readQuantities(buffer: Buffer): Promise<Array<[string, number]>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.getWorksheet("Tổng hợp tồn kho")!;
  const result: Array<[string, number]> = [];
  sheet.eachRow((row, index) => {
    if (index <= 7) return; // 6 dòng tiêu đề + 1 dòng header
    result.push([
      String(row.getCell(1).value ?? ""),
      Number(row.getCell(10).value ?? 0),
    ]);
  });
  return result;
}

describe("StockSummaryExportService", () => {
  const actor = { userId: "user-1", organizationId: ORG, branchId: "branch-1" };

  it("xuất cột 'Số lượng tồn' theo closingQty, không lấy số dư thô stock_balances", async () => {
    const service = createService([createRow()]);

    const buffer = await service.exportBuffer(
      {
        variant: StockSummaryExportVariant.VARIANTS,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      } as never,
      actor as never,
    );

    expect(await readQuantities(buffer)).toEqual([["ABA3335-D-40", 1]]);
  });

  it("trừ số lượng đang giữ khi excludeReservations bật, giống UI", async () => {
    const service = createService([createRow({ closingQty: 5, reservedQty: 2 })]);

    const buffer = await service.exportBuffer(
      {
        variant: StockSummaryExportVariant.VARIANTS,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        excludeReservations: true,
      } as never,
      actor as never,
    );

    expect(await readQuantities(buffer)).toEqual([["ABA3335-D-40", 3]]);
  });

  it("dòng mẫu mã cộng dồn closingQty của các biến thể", async () => {
    const service = createService(
      [
        createRow(),
        createRow({
          itemId: "c08b1d67-a6a5-4519-8697-2ac78d928077",
          item: { ...createRow().item, code: "ABA3335-N-40" },
        }),
      ],
      true,
    );

    const buffer = await service.exportBuffer(
      {
        variant: StockSummaryExportVariant.MODEL_AND_VARIANTS,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      } as never,
      actor as never,
    );

    expect(await readQuantities(buffer)).toEqual([
      ["ABA3335", 2],
      ["ABA3335-D-40", 1],
      ["ABA3335-N-40", 1],
    ]);
  });
});
