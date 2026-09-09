import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// PurchaseOrdersPage.tsx renders through hooks with side effects
// (IntersectionObserver, react-query) that need a real DOM; this workspace
// has no jsdom/RTL (see CLAUDE.md). Pin the exact source shape of the wiring
// instead, so a regression (the lines panel keyed off the header query's
// result instead of the raw selected id — the bug T-01-04 fixes) fails CI
// instead of silently shipping (AC-25).

const pageSource = readFileSync(
  path.join(__dirname, "PurchaseOrdersPage.tsx"),
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

describe("panel order id is wired from the raw selected id (not the header query)", () => {
  it("PurchaseOrdersPage passes selectedId directly as orderId, not selectedOrder.id", () => {
    const block = extractBlock(pageSource, "<DetailPanel", "/>");
    expect(block).toContain("orderId={selectedId}");
    expect(block).not.toContain("orderId={selectedOrder");
  });

  it("DetailPanel no longer derives orderId from the order prop", () => {
    const block = extractBlock(
      pageSource,
      "function DetailPanel({",
      "\n}) {",
    );
    expect(block).toContain("orderId: string | null");
    expect(block).not.toContain("const orderId = order?.id ?? null");
  });

  it("the panel's lines query is keyed by the raw orderId prop, not derived from order.id", () => {
    const block = extractBlock(
      pageSource,
      "const linesQuery = useInfiniteQuery(",
      "\n  });",
    );
    expect(block).toContain('["goods-receipt-lines", orderId]');
    expect(block).toContain("enabled: !!orderId");
    expect(block).not.toContain("order?.id");
  });
});
