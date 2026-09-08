import { beforeAll, describe, expect, it } from "vitest";

// StockTransferPage.tsx transitively imports a zustand store
// (store/common/branch/branch.store.ts) that reads `localStorage` at module
// init time. This package has no jsdom, so `localStorage` is undefined in
// the vitest environment — polyfill the minimum surface before the module
// graph loads. No component rendering happens; this only exercises the pure
// helpers below.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

interface TransferLine {
  id?: string;
  itemId: string;
  sourceStorageId?: string;
  destinationStorageId?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  quantity: number;
  unitPrice?: string | null;
  lineValue?: string | null;
  notes?: string;
  item?: { id: string; code: string; name: string; unit?: string } | null;
  sourceStorage?: { id: string; name: string } | null;
  destinationStorage?: { id: string; name: string } | null;
  sourceLocation?: { id: string; code: string; name: string } | null;
  destinationLocation?: { id: string; code: string; name: string } | null;
}

let getNextStockTransferLinesPageParam: (last: {
  page: number;
  limit: number;
  total: number;
}) => number | undefined;
let mapTransferLineToFormLine: (l: TransferLine) => {
  itemId: string;
  itemLabel: string;
  itemName: string;
  unit: string;
  sourceStorageId: string;
  sourceStorageLabel: string;
  sourceLocationId: string;
  sourceLocationLabel: string;
  destStorageId: string;
  destStorageLabel: string;
  destLocationId: string;
  destLocationLabel: string;
  quantity: number;
  unitPrice: string;
  notes: string;
};

beforeAll(async () => {
  ({ getNextStockTransferLinesPageParam, mapTransferLineToFormLine } =
    await import("./StockTransferPage"));
});

describe("getNextStockTransferLinesPageParam (AC-15)", () => {
  it("keeps paging while more rows remain on the server", () => {
    // 120-line phiếu, 50 rows/page: page 1 and 2 must both request a next
    // page, or the panel would stop 20 lines short of the full 120.
    expect(
      getNextStockTransferLinesPageParam({ page: 1, limit: 50, total: 120 }),
    ).toBe(2);
    expect(
      getNextStockTransferLinesPageParam({ page: 2, limit: 50, total: 120 }),
    ).toBe(3);
  });

  it("stops once the last page has been fetched", () => {
    // 120 = 3 * 50 - 30, i.e. page 3 covers rows 101-120 — nothing left.
    expect(
      getNextStockTransferLinesPageParam({ page: 3, limit: 50, total: 120 }),
    ).toBeUndefined();
  });

  it("stops immediately for a phiếu that fits on one page", () => {
    expect(
      getNextStockTransferLinesPageParam({ page: 1, limit: 50, total: 12 }),
    ).toBeUndefined();
  });
});

describe("mapTransferLineToFormLine (AC-16)", () => {
  const baseLine: TransferLine = {
    id: "line-1",
    itemId: "item-1",
    item: { id: "item-1", code: "SKU-01", name: "Áo thun", unit: "Cái" },
    sourceStorageId: "storage-src",
    sourceStorage: { id: "storage-src", name: "Kho xuất" },
    destinationStorageId: "storage-dst",
    destinationStorage: { id: "storage-dst", name: "Kho nhập" },
    sourceLocationId: "loc-src",
    sourceLocation: { id: "loc-src", code: "A1-01", name: "Kệ A1" },
    destinationLocationId: "loc-dst",
    destinationLocation: { id: "loc-dst", code: "B2-02", name: "Kệ B2" },
    quantity: 5,
    unitPrice: "10000",
    lineValue: "50000",
    notes: "Ghi chú dòng",
  };

  it("carries every field of a fully-populated line into the grid row", () => {
    const mapped = mapTransferLineToFormLine(baseLine);
    expect(mapped).toEqual({
      itemId: "item-1",
      itemLabel: "SKU-01",
      itemName: "Áo thun",
      unit: "Cái",
      sourceStorageId: "storage-src",
      sourceStorageLabel: "Kho xuất",
      sourceLocationId: "loc-src",
      sourceLocationLabel: "A1-01",
      destStorageId: "storage-dst",
      destStorageLabel: "Kho nhập",
      destLocationId: "loc-dst",
      destLocationLabel: "B2-02",
      quantity: 5,
      unitPrice: "10000",
      notes: "Ghi chú dòng",
    });
  });

  it("maps every line in a multi-line phiếu — none are dropped", () => {
    const lines: TransferLine[] = [
      { ...baseLine, itemId: "item-1" },
      { ...baseLine, itemId: "item-2" },
      { ...baseLine, itemId: "item-3" },
    ];
    const mapped = lines.map(mapTransferLineToFormLine);
    expect(mapped).toHaveLength(3);
    expect(mapped.map((l) => l.itemId)).toEqual(["item-1", "item-2", "item-3"]);
  });

  it("falls back to blanks/id-prefix for a line missing its resolved relations", () => {
    const sparse: TransferLine = {
      itemId: "item-99999999-xxxx",
      quantity: 2,
    };
    const mapped = mapTransferLineToFormLine(sparse);
    expect(mapped.itemLabel).toBe("item-999"); // itemId.slice(0, 8)
    expect(mapped.itemName).toBe("");
    expect(mapped.unit).toBe("");
    expect(mapped.sourceStorageId).toBe("");
    expect(mapped.sourceLocationLabel).toBe("");
    expect(mapped.destLocationLabel).toBe("");
    expect(mapped.unitPrice).toBe("");
    expect(mapped.notes).toBe("");
    expect(mapped.quantity).toBe(2);
  });
});
