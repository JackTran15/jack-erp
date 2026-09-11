import { describe, expect, it } from "vitest";

import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import {
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  type TempWarehouseLine,
} from "@erp/shared-interfaces";

import {
  catalogLocationsForLine,
  lineToToolbarDraft,
} from "./fast-stock-transfer-pickers";
import { catalogLineFromTempWarehouseLine } from "./picker-cache";
import { mapDraftToPatchBody } from "./temp-warehouse-mappers";

/**
 * `locations[]` là trường duy nhất trong `PosCatalogLine` mà việc tối ưu đường
 * tìm kiếm POS có thể vô tình làm rỗng. Chuyển kho nhanh là consumer thật của
 * nó: mất `locations[]` thì ô chọn kho nguồn trống mà không báo lỗi gì.
 */
const line = (over: Partial<PosCatalogLine>): PosCatalogLine => ({
  itemId: "I1",
  productId: null,
  code: "SKU-1",
  name: "Hàng thử",
  unit: "cái",
  sellingPrice: 100,
  quantityOnHand: 0,
  sellableQuantity: 0,
  locations: [],
  defaultLocationId: "",
  ...over,
});

describe("catalogLocationsForLine", () => {
  it("trả nguyên danh sách kho khi endpoint có gửi locations", () => {
    const locations = [
      { locationId: "L1", name: "Kệ A", quantity: 5 },
      { locationId: "L2", name: "Kho sau", quantity: 2 },
    ];

    expect(catalogLocationsForLine(line({ locations }))).toEqual(locations);
  });

  it("dựng một dòng từ defaultLocationId khi locations rỗng", () => {
    const res = catalogLocationsForLine(
      line({ defaultLocationId: "L9", quantityOnHand: 7 }),
    );

    expect(res).toEqual([{ locationId: "L9", name: "", quantity: 7 }]);
  });

  it("trả rỗng khi không có cả locations lẫn defaultLocationId", () => {
    expect(catalogLocationsForLine(line({}))).toEqual([]);
  });
});

/**
 * Mục 9 QA 11/09 (temp-warehouse-line-shelf): Sửa → Lưu ghi `notes` bằng kệ của
 * phiên (A01.01) vì cả cache lẫn `locationFromLine` lấy kệ phiên làm kệ của mặt
 * hàng. Khứ hồi không cần DOM: dòng → sản phẩm cache → draft Sửa → body Lưu.
 */
describe("Sửa → Lưu giữ kệ của dòng", () => {
  // `mapDraftToPatchBody` chỉ gửi sourceLocationId dạng UUID.
  const SHELF_A05_03 = {
    id: "a5030000-0000-4000-8000-000000000001",
    code: "A05.03",
    name: "A05.03",
  };
  const SHELF_T05_05 = {
    id: "7e050000-0000-4000-8000-000000000004",
    code: "T05.05",
    name: "T05.05",
  };
  const SESSION_A01_01 = {
    id: "a1010000-0000-4000-8000-000000000002",
    code: "A01.01",
    name: "A01.01",
  };
  const SESSION_SHOWROOM = {
    id: "5e550000-0000-4000-8000-000000000003",
    code: "SR01",
    name: "SR01",
  };

  const twLine = (over: Partial<TempWarehouseLine>): TempWarehouseLine =>
    ({
      id: "line-1",
      organizationId: "org-1",
      branchId: "branch-1",
      sessionId: "session-1",
      itemId: "I1",
      direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
      quantity: "1.00",
      carrierUserId: null,
      status: TempWarehouseLineStatus.ACTIVE,
      supersededById: null,
      notes: null,
      sourceLocationId: null,
      createdAt: "2026-09-10T03:00:00.000Z",
      updatedAt: "2026-09-10T03:00:00.000Z",
      createdBy: "user-1",
      item: { id: "I1", code: "MY1901-D-37", name: "Giày thử", unit: "đôi" },
      ...over,
    }) as TempWarehouseLine;

  const saveUnchanged = (row: TempWarehouseLine) =>
    mapDraftToPatchBody(
      lineToToolbarDraft(row, catalogLineFromTempWarehouseLine(row)),
    );

  it("Xuất đi: notes là kệ đã quét, không phải kệ phiên (AC-02)", () => {
    const body = saveUnchanged(
      twLine({
        notes: "A05.03",
        sourceLocationId: SHELF_A05_03.id,
        sourceShelf: SHELF_A05_03,
        sourceLocation: SESSION_A01_01,
        destinationLocation: SESSION_SHOWROOM,
      }),
    );

    expect(body.notes).toBe("A05.03");
    expect(body.sourceLocationId).toBe(SHELF_A05_03.id);
  });

  it("Trả lại: notes là kệ đã quét, không phải kệ phiên (AC-04)", () => {
    const body = saveUnchanged(
      twLine({
        direction: TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
        notes: "T05.05",
        sourceLocationId: SHELF_T05_05.id,
        sourceShelf: SHELF_T05_05,
        sourceLocation: SESSION_SHOWROOM,
        destinationLocation: SESSION_A01_01,
      }),
    );

    expect(body.notes).toBe("T05.05");
    expect(body.sourceLocationId).toBe(SHELF_T05_05.id);
  });

  it("dòng đã bị ghi sai notes từ trước được ghi lại đúng kệ khi Lưu", () => {
    const body = saveUnchanged(
      twLine({
        notes: "A01.01",
        sourceLocationId: SHELF_A05_03.id,
        sourceShelf: SHELF_A05_03,
        sourceLocation: SESSION_A01_01,
        destinationLocation: SESSION_SHOWROOM,
      }),
    );

    expect(body.notes).toBe("A05.03");
    expect(body.sourceLocationId).toBe(SHELF_A05_03.id);
  });

  it("sản phẩm trong cache không có kệ của dòng ⇒ tên vẫn lấy từ sourceShelf, không từ kệ phiên", () => {
    const cached = line({
      locations: [
        { locationId: SESSION_A01_01.id, name: "A01.01", quantity: 0 },
      ],
      defaultLocationId: SESSION_A01_01.id,
    });

    const draft = lineToToolbarDraft(
      twLine({
        notes: "A01.01",
        sourceLocationId: SHELF_A05_03.id,
        sourceShelf: SHELF_A05_03,
        sourceLocation: SESSION_A01_01,
      }),
      cached,
    );

    expect(draft.location).toEqual({
      locationId: SHELF_A05_03.id,
      name: "A05.03",
      quantity: 0,
    });
  });
});
