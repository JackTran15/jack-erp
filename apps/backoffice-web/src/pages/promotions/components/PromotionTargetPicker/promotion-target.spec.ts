import { describe, expect, it } from "vitest";
import { PromotionDiscountMode, PromotionTargetType } from "@erp/shared-interfaces";
import type { ProductSelectResult } from "../../../../components/shared/product-select/ProductSelectDialog";
import { promoPrice, toPromotionTargets } from "./promotion-target";

function line(overrides: Partial<ProductSelectResult["lines"][number]> = {}) {
  return {
    itemId: "item-1",
    sku: "SKU-1",
    name: "Giày nữ",
    unit: "Đôi",
    categoryName: null,
    purchasePrice: 0,
    sellingPrice: 685_000,
    variantLabel: null,
    quantity: 1,
    unitPrice: 685_000,
    ...overrides,
  };
}

function result(overrides: Partial<ProductSelectResult> = {}): ProductSelectResult {
  return {
    lines: [],
    fullySelectedProductIds: [],
    standaloneItemIds: [],
    allSelectedItemIds: [],
    fullySelectedProducts: [],
    ...overrides,
  };
}

describe("toPromotionTargets", () => {
  it("phân biệt chọn cả hàng hóa (PRODUCT) với chọn lẻ mẫu mã (ITEM)", () => {
    const drafts = toPromotionTargets(
      result({
        lines: [line({ itemId: "item-a" }), line({ itemId: "item-b", sku: "SKU-B" })],
        fullySelectedProductIds: ["prod-1"],
        fullySelectedProducts: [
          {
            type: "product",
            id: "prod-1",
            code: "SP001",
            name: "Giày nam",
            categoryId: null,
            categoryName: null,
            unit: "Đôi",
            purchasePrice: 0,
            sellingPrice: 500_000,
            brand: null,
            itemType: null,
            isPosVisible: true,
            isActive: true,
            itemCount: 3,
          },
        ],
        standaloneItemIds: ["item-b"],
      }),
      "PRODUCT_OR_ITEM",
    );

    expect(drafts).toEqual([
      {
        targetType: PromotionTargetType.PRODUCT,
        targetId: "prod-1",
        code: "SP001",
        name: "Giày nam",
        unit: "Đôi",
        sellingPrice: 500_000,
      },
      {
        targetType: PromotionTargetType.ITEM,
        targetId: "item-b",
        code: "SKU-B",
        name: "Giày nữ",
        unit: "Đôi",
        sellingPrice: 685_000,
      },
    ]);
  });

  it("chế độ ITEM bung product được chọn trọn thành từng mẫu mã, không bỏ qua im lặng", () => {
    const drafts = toPromotionTargets(
      result({
        lines: [line({ itemId: "v1", sku: "V1" }), line({ itemId: "v2", sku: "V2" })],
        fullySelectedProductIds: ["prod-1"],
        fullySelectedProducts: [],
        standaloneItemIds: [],
      }),
      "ITEM",
    );

    expect(drafts.map((d) => d.targetId)).toEqual(["v1", "v2"]);
    expect(drafts.every((d) => d.targetType === PromotionTargetType.ITEM)).toBe(true);
  });

  it("gắn variantLabel vào tên để hai mẫu mã cùng hàng hóa không trùng tên trên lưới", () => {
    const [draft] = toPromotionTargets(
      result({
        lines: [line({ itemId: "v1", variantLabel: "Đỏ / 39" })],
        standaloneItemIds: ["v1"],
      }),
      "PRODUCT_OR_ITEM",
    );

    expect(draft.name).toBe("Giày nữ (Đỏ / 39)");
  });

  it("chế độ CATEGORY không lấy gì từ kết quả chọn hàng hóa", () => {
    const drafts = toPromotionTargets(
      result({ lines: [line()], standaloneItemIds: ["item-1"] }),
      "CATEGORY",
    );
    expect(drafts).toEqual([]);
  });
});

describe("promoPrice", () => {
  // AC-01 — mốc chuẩn của cả epic.
  it("AC-01: 685.000 giảm 30% → 479.500", () => {
    expect(promoPrice(685_000, PromotionDiscountMode.PERCENT, 30)).toBe(479_500);
  });

  it("AMOUNT trừ thẳng và không cho âm", () => {
    expect(promoPrice(685_000, PromotionDiscountMode.AMOUNT, 85_000)).toBe(600_000);
    expect(promoPrice(50_000, PromotionDiscountMode.AMOUNT, 80_000)).toBe(0);
  });

  it("FIXED_PRICE lấy thẳng giá đặt, bỏ qua giá bán", () => {
    expect(promoPrice(685_000, PromotionDiscountMode.FIXED_PRICE, 499_000)).toBe(499_000);
  });

  it("làm tròn về đồng, khớp roundVnd của domain", () => {
    // 333.333 × 33% = 223.333,11 → 223.333
    expect(promoPrice(333_333, PromotionDiscountMode.PERCENT, 33)).toBe(223_333);
  });
});
