import { beforeAll, describe, expect, it } from "vitest";

// TransferOrdersPage.tsx transitively imports a zustand store
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

let buildSelectedTransferOrderHeaderRequest: (
  id: string,
) => { params: { path: { id: string }; query: { includeLines: boolean } } };
let getNextTransferOrderLinesPageParam: (last: {
  page: number;
  limit: number;
  total: number;
}) => number | undefined;

beforeAll(async () => {
  ({
    buildSelectedTransferOrderHeaderRequest,
    getNextTransferOrderLinesPageParam,
  } = await import("./TransferOrdersPage"));
});

describe("buildSelectedTransferOrderHeaderRequest (AC-09)", () => {
  it("requests the header without lines", () => {
    const request = buildSelectedTransferOrderHeaderRequest("order-1");

    expect(request.params.path.id).toBe("order-1");
    expect(request.params.query.includeLines).toBe(false);
  });

  it("does not carry a stray query param that could re-enable the BE default", () => {
    const request = buildSelectedTransferOrderHeaderRequest("order-2");

    // Guards against re-introducing `includeLines: true`/undefined, which
    // would fall back to the BE default (true) and defeat AC-09.
    expect(Object.keys(request.params.query)).toEqual(["includeLines"]);
  });
});

describe("getNextTransferOrderLinesPageParam (AC-10)", () => {
  it("keeps paging while more rows remain on the server", () => {
    // 120-line voucher, 50 rows/page: page 1 and 2 must both request a next
    // page, or the user would stop 20 lines short of the full 120 (AC-10).
    expect(
      getNextTransferOrderLinesPageParam({ page: 1, limit: 50, total: 120 }),
    ).toBe(2);
    expect(
      getNextTransferOrderLinesPageParam({ page: 2, limit: 50, total: 120 }),
    ).toBe(3);
  });

  it("stops once the last page has been fetched", () => {
    // 120 = 3 * 50 - 30, i.e. page 3 covers rows 101-120 — nothing left.
    expect(
      getNextTransferOrderLinesPageParam({ page: 3, limit: 50, total: 120 }),
    ).toBeUndefined();
  });

  it("stops immediately for a voucher that fits on one page", () => {
    expect(
      getNextTransferOrderLinesPageParam({ page: 1, limit: 50, total: 12 }),
    ).toBeUndefined();
  });
});
