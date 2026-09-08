import { describe, expect, it } from "vitest";

import { CATALOG_KEYS } from "./react-query-key.constant";

describe("CATALOG_KEYS.STOCK", () => {
  it("dựng key từ nội dung mảng, không từ reference", () => {
    // Giỏ hàng đổi reference mỗi lần sửa số lượng. Nếu key theo reference thì
    // hook đồng bộ tồn fetch lại mỗi render — vòng lặp request.
    const a = CATALOG_KEYS.STOCK("b1", ["I1", "I2"]);
    const b = CATALOG_KEYS.STOCK("b1", ["I1", "I2"]);
    expect(a).toEqual(b);
  });

  it("cùng tập id khác thứ tự cho cùng key", () => {
    expect(CATALOG_KEYS.STOCK("b1", ["I2", "I1"])).toEqual(
      CATALOG_KEYS.STOCK("b1", ["I1", "I2"]),
    );
  });

  it("khác tập id thì khác key", () => {
    expect(CATALOG_KEYS.STOCK("b1", ["I1"])).not.toEqual(
      CATALOG_KEYS.STOCK("b1", ["I1", "I2"]),
    );
  });

  it("khác chi nhánh thì khác key", () => {
    expect(CATALOG_KEYS.STOCK("b1", ["I1"])).not.toEqual(
      CATALOG_KEYS.STOCK("b2", ["I1"]),
    );
  });

  it("không đụng vào mảng gọi vào", () => {
    const ids = ["I2", "I1"];
    CATALOG_KEYS.STOCK("b1", ids);
    expect(ids).toEqual(["I2", "I1"]);
  });
});

describe("CATALOG_KEYS.SEARCH_V2", () => {
  it("phân biệt theo limit", () => {
    // Ô tìm gọi limit=20 (dropdown); addProductByQuery gọi limit=2 (chỉ đếm
    // 0/1/nhiều). Cùng chuỗi, cùng mode, cùng view — thiếu limit trong key thì
    // lời gọi thứ hai im lặng nhận lại 20 dòng đã cache.
    expect(
      CATALOG_KEYS.SEARCH_V2("b1", "abc", "full", "suggest", 2),
    ).not.toEqual(CATALOG_KEYS.SEARCH_V2("b1", "abc", "full", "suggest", 20));
  });

  it("limit không truyền cũng là một giá trị key riêng", () => {
    expect(
      CATALOG_KEYS.SEARCH_V2("b1", "abc", "full", "suggest", undefined),
    ).not.toEqual(CATALOG_KEYS.SEARCH_V2("b1", "abc", "full", "suggest", 20));
  });

  it("phân biệt theo mode và view", () => {
    const base = CATALOG_KEYS.SEARCH_V2("b1", "abc", "full", "suggest", 20);
    expect(base).not.toEqual(
      CATALOG_KEYS.SEARCH_V2("b1", "abc", "exact", "suggest", 20),
    );
    expect(base).not.toEqual(
      CATALOG_KEYS.SEARCH_V2("b1", "abc", "full", "full", 20),
    );
  });
});
