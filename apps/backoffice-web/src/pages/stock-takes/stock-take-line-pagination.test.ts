import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// StockTakesPage.tsx / StockTakeDetailPanel.tsx render through hooks with
// side effects (IntersectionObserver, react-query) that need a real DOM;
// this workspace has no jsdom/RTL (see CLAUDE.md). Two strategies below
// instead: (1) import the panel's pure pagination helper directly, and (2)
// pin the exact source shape of the write paths, so a regression (a write
// action reading `selectedDetail.lines` again, the light fetch dropping
// `includeLines=false`, the panel keyed off the header result instead of
// the raw id) fails CI instead of silently shipping (AC-18, AC-19).
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

let getNextStockTakeLinesPageParam: (last: {
  page: number;
  limit: number;
  total: number;
}) => number | undefined;

beforeAll(async () => {
  ({ getNextStockTakeLinesPageParam } = await import(
    "./StockTakeDetailPanel"
  ));
});

describe("getNextStockTakeLinesPageParam (AC-18)", () => {
  it("keeps paging while more rows remain on the server", () => {
    // 1 000-line phiếu, 50 rows/page — every page short of the last one
    // must request a next page, or the panel would stop short of 1 000.
    expect(
      getNextStockTakeLinesPageParam({ page: 1, limit: 50, total: 1000 }),
    ).toBe(2);
    expect(
      getNextStockTakeLinesPageParam({ page: 19, limit: 50, total: 1000 }),
    ).toBe(20);
  });

  it("stops once the last page has been fetched", () => {
    expect(
      getNextStockTakeLinesPageParam({ page: 20, limit: 50, total: 1000 }),
    ).toBeUndefined();
  });

  it("stops immediately for a phiếu that fits on one page", () => {
    expect(
      getNextStockTakeLinesPageParam({ page: 1, limit: 50, total: 12 }),
    ).toBeUndefined();
  });
});

const pageSource = readFileSync(
  path.join(__dirname, "StockTakesPage.tsx"),
  "utf8",
);
const panelSource = readFileSync(
  path.join(__dirname, "StockTakeDetailPanel.tsx"),
  "utf8",
);

function extractBlock(
  source: string,
  startLiteral: string,
  endLiteral: string,
): string {
  const start = source.indexOf(startLiteral);
  expect(start, `expected to find ${startLiteral}`).toBeGreaterThan(-1);
  const end = source.indexOf(endLiteral, start);
  expect(end).toBeGreaterThan(-1);
  return source.slice(start, end);
}

describe("row select fetches the header only (ADR-09)", () => {
  it("selectStockTake requests includeLines=false", () => {
    const block = extractBlock(
      pageSource,
      "const selectStockTake = useCallback(",
      "\n  );",
    );
    expect(block).toContain("includeLines=false");
    expect(block).toContain("setSelectedDetail(data)");
  });
});

describe("write path always fetches full lines (AC-19, ADR-02)", () => {
  it("fetchStockTakeWithLines requests the default (full) endpoint, no includeLines flag", () => {
    const block = extractBlock(
      pageSource,
      "async function fetchStockTakeWithLines(",
      "\n}",
    );
    expect(block).toContain("/inventory/stock-takes/${id}");
    expect(block).not.toContain("includeLines");
  });

  it("openForEdit — the only path that opens the save dialog — uses fetchStockTakeWithLines, never selectedDetail", () => {
    const block = extractBlock(
      pageSource,
      "const openForEdit = useCallback(",
      "\n  );",
    );
    expect(block).toContain("fetchStockTakeWithLines(id)");
    expect(block).not.toContain("selectedDetail");
    // Locks Xem/Sửa (A-02) while the fetch is in flight.
    expect(block).toContain("setOpeningId(id)");
    expect(block).toContain("setOpeningId(null)");
  });

  it("no other site reads selectedDetail.lines — the only reads are the state declaration, the race guard, and the panel's header prop", () => {
    const matches = [...pageSource.matchAll(/selectedDetail(\??\.\w+)?/g)].map(
      (m) => m[0],
    );
    // Every occurrence must be one of: the state hook itself, an `.id`
    // comparison (race guard / panel header selection), or `setSelectedDetail`
    // calls. None may be `.lines`.
    for (const occurrence of matches) {
      expect(occurrence).not.toMatch(/\.lines\b/);
    }
    expect(matches.length).toBeGreaterThan(0);
  });

  it("the merge preview payload's `lines` field comes from the merge-preview response, not selectedDetail", () => {
    const block = extractBlock(pageSource, "const handleMerge = async ()", "\n  };");
    expect(block).toContain("lines: data.lines");
    expect(block).not.toContain("selectedDetail");
  });
});

describe("panel voucher id is wired from the raw selected id (not the header query)", () => {
  it("StockTakesPage passes selectedId directly, not panelStockTake.id", () => {
    const block = extractBlock(
      pageSource,
      "<StockTakeDetailPanel",
      "/>",
    );
    expect(block).toContain("voucherId={selectedId}");
    expect(block).not.toContain("voucherId={panelStockTake");
    expect(block).not.toContain("voucherId={selectedDetail");
  });

  it("the panel's lines query is keyed by the raw voucherId prop, not by stockTake.id", () => {
    const block = extractBlock(
      panelSource,
      "const linesQuery = useInfiniteQuery(",
      "\n  });",
    );
    expect(block).toContain('["stock-take-lines", voucherId]');
    expect(block).toContain("enabled: !!voucherId");
  });
});
