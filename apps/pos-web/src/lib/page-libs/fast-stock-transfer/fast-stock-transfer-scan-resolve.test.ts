import { describe, expect, it } from "vitest";

import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { decideScanOutcome } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-scan-resolve";

function makeLine(code: string): PosCatalogLine {
  return {
    itemId: `item-${code}`,
    productId: null,
    code,
    name: `Giày thể thao ${code}`,
    unit: "Đôi",
    sellingPrice: 0,
    quantityOnHand: 0,
    locations: [],
    defaultLocationId: "",
  };
}

describe("decideScanOutcome", () => {
  it("thêm luôn khi tra ra đúng một mặt hàng", () => {
    const only = makeLine("AKSK6769-N-41");

    expect(
      decideScanOutcome({
        highlighted: null,
        query: "AKSK6769-N-41",
        candidates: [only],
      }),
    ).toEqual({ kind: "add", product: only });
  });

  it("dòng đang nổi thắng cả khi danh sách có nhiều ứng viên", () => {
    const highlighted = makeLine("MY1020-TR-37");

    expect(
      decideScanOutcome({
        highlighted,
        query: "MY1020",
        candidates: [makeLine("MY1020-TR-38"), makeLine("MY1020-TR-39")],
      }),
    ).toEqual({ kind: "add", product: highlighted });
  });

  it("dòng đang nổi thắng cả khi không tra ra ứng viên nào", () => {
    const highlighted = makeLine("MY1020-TR-37");

    expect(
      decideScanOutcome({ highlighted, query: "MY1020", candidates: [] }),
    ).toEqual({ kind: "add", product: highlighted });
  });

  it("không làm gì khi ô rỗng, kể cả khi danh sách cũ còn ứng viên", () => {
    expect(
      decideScanOutcome({
        highlighted: null,
        query: "   ",
        candidates: [makeLine("AKSK6769-N-41")],
      }),
    ).toEqual({ kind: "none" });
  });

  it("mở gợi ý và giữ nguyên thứ tự khi có nhiều ứng viên", () => {
    const first = makeLine("MY1020-TR-37");
    const second = makeLine("MY1020-TR-38");

    expect(
      decideScanOutcome({
        highlighted: null,
        query: "MY1020",
        candidates: [first, second],
      }),
    ).toEqual({ kind: "suggest", candidates: [first, second] });
  });

  it("báo rỗng khi có chữ nhưng không tra ra gì", () => {
    expect(
      decideScanOutcome({
        highlighted: null,
        query: "xxxx-khong-co-that",
        candidates: [],
      }),
    ).toEqual({ kind: "empty" });
  });
});
