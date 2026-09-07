import { describe, expect, it } from "vitest";
import { buildLineSearchBody, parseVnNumberInput } from "./line-filter-search";

/** Grid column key → DTO field, as both view dialogs declare it. */
const FIELDS = {
  itemLabel: "itemCode",
  itemName: "itemName",
  quantity: "quantity",
  unitPrice: "unitPrice",
  lineTotal: "lineTotal",
};

describe("parseVnNumberInput", () => {
  it("reads vi-VN grouping and decimal marks", () => {
    expect(parseVnNumberInput("1.234,5")).toBe(1234.5);
    expect(parseVnNumberInput("1000")).toBe(1000);
    expect(parseVnNumberInput(" 12 ")).toBe(12);
  });

  it("returns null for input that is still being typed", () => {
    // The grid must not blank while someone is mid-number, so these are dropped
    // from the request rather than sent as garbage.
    expect(parseVnNumberInput("")).toBeNull();
    expect(parseVnNumberInput("-")).toBeNull();
    expect(parseVnNumberInput("abc")).toBeNull();
  });

  it("treats a trailing separator as the number before it, like the grid does", () => {
    expect(parseVnNumberInput("1,")).toBe(1);
  });
});

describe("buildLineSearchBody", () => {
  it("always carries the page window", () => {
    expect(buildLineSearchBody({}, FIELDS, 2, 50)).toEqual({ page: 2, limit: 50 });
  });

  it("sends text columns as substring matches — the `*` the header shows", () => {
    expect(
      buildLineSearchBody({ itemLabel: "ABA", itemName: "Sapo" }, FIELDS, 1, 50),
    ).toEqual({
      page: 1,
      limit: 50,
      itemCode: { operator: "*", value: "ABA" },
      itemName: { operator: "*", value: "Sapo" },
    });
  });

  it("sends numeric columns as `<=` — the `≤` the header shows", () => {
    expect(
      buildLineSearchBody(
        { quantity: "5", unitPrice: "1.000", lineTotal: "2.000,5" },
        FIELDS,
        1,
        50,
      ),
    ).toEqual({
      page: 1,
      limit: 50,
      quantity: { operator: "<=", value: 5 },
      unitPrice: { operator: "<=", value: 1000 },
      lineTotal: { operator: "<=", value: 2000.5 },
    });
  });

  it("drops blank and whitespace-only filters instead of matching everything", () => {
    expect(buildLineSearchBody({ itemLabel: "   ", itemName: "" }, FIELDS, 1, 50)).toEqual({
      page: 1,
      limit: 50,
    });
  });

  it("drops a half-typed number rather than sending it", () => {
    // Sending `-` would either 400 or match nothing, and the grid would blank on
    // the first keystroke of a negative limit.
    expect(buildLineSearchBody({ quantity: "-" }, FIELDS, 1, 50)).toEqual({
      page: 1,
      limit: 50,
    });
  });

  it("treats a column as numeric by its DTO field, not its grid key", () => {
    // The receipt grid names its quantity column `orderedQuantity`; the issue
    // grid names it `quantity`. Both map to the DTO's `quantity`, so `≤` has to
    // follow the field or the receipt grid would send a substring match.
    expect(
      buildLineSearchBody({ orderedQuantity: "7" }, { orderedQuantity: "quantity" }, 1, 50),
    ).toEqual({ page: 1, limit: 50, quantity: { operator: "<=", value: 7 } });
  });

  it("ignores columns the server cannot filter on", () => {
    // Kho / Vị trí / ĐVT have no filter cell in view mode, but a stale entry can
    // survive in the map; it must not reach the request, where it would 400 on
    // forbidNonWhitelisted.
    expect(
      buildLineSearchBody(
        { warehouse: "Kho A", position: "A01", unit: "Đôi", itemLabel: "X" },
        FIELDS,
        1,
        50,
      ),
    ).toEqual({ page: 1, limit: 50, itemCode: { operator: "*", value: "X" } });
  });

  it("trims the value it sends", () => {
    expect(buildLineSearchBody({ itemLabel: "  ABA  " }, FIELDS, 1, 50)).toEqual({
      page: 1,
      limit: 50,
      itemCode: { operator: "*", value: "ABA" },
    });
  });
});
