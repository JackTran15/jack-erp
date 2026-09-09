import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// GoodsIssuePage.tsx renders through react-query hooks with side effects that
// need a real DOM; this workspace has no jsdom/RTL (see CLAUDE.md), so those
// hooks cannot be exercised by rendering the component. This test instead
// pins the exact source shape of the select-row query so a regression (the
// flag silently dropped again, or moved to a different query) fails CI.
const pageSource = readFileSync(
  path.join(__dirname, "GoodsIssuePage.tsx"),
  "utf8",
);

function extractQueryBlock(queryKeyLiteral: string): string {
  const keyIndex = pageSource.indexOf(queryKeyLiteral);
  expect(keyIndex, `expected to find ${queryKeyLiteral} in GoodsIssuePage.tsx`).toBeGreaterThan(-1);
  const blockEnd = pageSource.indexOf("});", keyIndex);
  expect(blockEnd).toBeGreaterThan(-1);
  return pageSource.slice(keyIndex, blockEnd);
}

describe("GoodsIssuePage select-row detail query (AC-05)", () => {
  it("requests GET /inventory/goods-issues/{id} with includeLines=false", () => {
    const block = extractQueryBlock('queryKey: ["goods-issue", selectedId]');

    expect(block).toContain("/inventory/goods-issues/{id}");
    expect(block).toContain("query: { includeLines: false }");
  });

  it("keeps the queryKey unchanged so existing invalidations still match", () => {
    expect(pageSource).toContain('queryKey: ["goods-issue", selectedId]');
  });
});

describe("GoodsIssuePage DetailPanel id source (AC-26)", () => {
  it("passes the raw selectedId into DetailPanel, not the header query's result", () => {
    // Regression this guards against: `issueId={selectedIssue?.id ?? null}`
    // (or any other derivation off the header query) would gate the lines
    // request behind the header round-trip, reproducing 2026083002.
    expect(pageSource).toContain("<DetailPanel\n            issueId={selectedId}");
    expect(pageSource).not.toContain("issueId={selectedIssue");
  });

  it("DetailPanel derives its lines query key straight from the issueId prop, not from a header query result", () => {
    const block = extractQueryBlock('queryKey: ["goods-issue-lines", issueId]');

    // The old shape declared `const issueId = issue?.id ?? null;` inside
    // DetailPanel, deriving the id from a header-query prop instead of
    // receiving it directly.
    expect(pageSource).not.toContain("const issueId = issue?.id ?? null");
    expect(block).toContain("enabled: !!issueId");
  });
});
