import { describe, expect, it } from "vitest";

import {
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  type TempWarehouseLine,
} from "@erp/shared-interfaces";

import { catalogLineFromTempWarehouseLine } from "./picker-cache";

/**
 * `syncFromLines` ghi đè cache sản phẩm bằng hàm này mỗi lần tải dòng. Khi nó lấy
 * kệ của phiên (A01.01) làm kệ của mặt hàng, Sửa → Lưu ghi `notes` sai
 * (mục 9 QA 11/09, temp-warehouse-line-shelf).
 */
const SHELF = { id: "shelf-a05-03", code: "A05.03", name: "A05.03" };
const SESSION_WAREHOUSE = { id: "session-wh", code: "A01.01", name: "A01.01" };
const SESSION_SHOWROOM = { id: "session-sr", code: "SR01", name: "SR01" };

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
    sourceLocation: SESSION_WAREHOUSE,
    destinationLocation: SESSION_SHOWROOM,
    ...over,
  }) as TempWarehouseLine;

describe("catalogLineFromTempWarehouseLine", () => {
  it("dùng kệ của dòng khi API gửi sourceShelf", () => {
    const product = catalogLineFromTempWarehouseLine(
      twLine({ sourceLocationId: SHELF.id, sourceShelf: SHELF }),
    );

    expect(product?.locations).toEqual([
      { locationId: SHELF.id, name: "A05.03", quantity: 0 },
    ]);
    expect(product?.defaultLocationId).toBe(SHELF.id);
  });

  it("không có sourceShelf ⇒ kệ của phiên theo chiều như cũ", () => {
    expect(
      catalogLineFromTempWarehouseLine(twLine({ sourceShelf: null }))
        ?.defaultLocationId,
    ).toBe(SESSION_WAREHOUSE.id);
    expect(
      catalogLineFromTempWarehouseLine(
        twLine({
          direction: TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
          sourceLocation: SESSION_SHOWROOM,
          destinationLocation: SESSION_WAREHOUSE,
        }),
      )?.defaultLocationId,
    ).toBe(SESSION_WAREHOUSE.id);
  });
});
