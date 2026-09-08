import { describe, expect, it } from "vitest";

import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";

import { catalogLocationsForLine } from "./fast-stock-transfer-pickers";

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
