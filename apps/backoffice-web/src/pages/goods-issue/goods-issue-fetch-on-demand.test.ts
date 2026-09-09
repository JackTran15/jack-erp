import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// GoodsIssuePage.tsx renders through react-query hooks with side effects that
// need a real DOM; this workspace has no jsdom/RTL (see CLAUDE.md), so the
// fetch-on-click behaviour cannot be exercised by rendering the component and
// clicking a button. This test instead pins the exact source shape of the
// helper and the three toolbar actions that use it, so a regression (flag
// re-added, error path opening the dialog anyway, a second lock flag) fails
// CI instead of silently shipping (T-02-02, AC-06, ADR-02).
const pageSource = readFileSync(
  path.join(__dirname, "GoodsIssuePage.tsx"),
  "utf8",
);

function extractBlock(startLiteral: string, endLiteral = "},"): string {
  const start = pageSource.indexOf(startLiteral);
  expect(start, `expected to find ${startLiteral} in GoodsIssuePage.tsx`).toBeGreaterThan(-1);
  const end = pageSource.indexOf(endLiteral, start);
  expect(end).toBeGreaterThan(-1);
  return pageSource.slice(start, end);
}

describe("fetchGoodsIssueWithLines helper", () => {
  it("calls GET /inventory/goods-issues/{id} with no includeLines flag (ADR-01 default stays true)", () => {
    const block = extractBlock(
      "async function fetchGoodsIssueWithLines(",
      "\n}",
    );
    expect(block).toContain("/inventory/goods-issues/{id}");
    expect(block).not.toContain("includeLines");
  });
});

describe("toolbar actions that need the full line array (AC-06)", () => {
  it("Nhân bản (duplicate) fetches full lines via the shared helper before opening the dialog", () => {
    const block = extractBlock('id: "duplicate"', '\n    },');
    expect(block).toContain("setPendingAction(\"duplicate\")");
    expect(block).toContain("fetchGoodsIssueWithLines(selectedIssue.id)");
    expect(block).toContain("setDialogMode(\"create\")");
    // pendingAction reset in a finally, and it locks only this one action.
    expect(block).toContain("setPendingAction(null)");
    expect(block).toContain('pendingAction === "duplicate"');
  });

  it("Sửa (edit) fetches full lines via the shared helper before opening the dialog", () => {
    const block = extractBlock('id: "edit"', '\n    },');
    expect(block).toContain("setPendingAction(\"edit\")");
    expect(block).toContain("fetchGoodsIssueWithLines(selectedIssue.id)");
    expect(block).toContain("setDialogMode(\"edit\")");
    expect(block).toContain("setPendingAction(null)");
    expect(block).toContain('pendingAction === "edit"');
  });

  it("In tem mã (no rows ticked) fetches full lines via the shared helper", () => {
    const block = extractBlock('id: "barcode"', "\n    },\n  ];");
    expect(block).toContain("checkedCount === 0");
    expect(block).toContain("fetchGoodsIssueWithLines(selectedIssue.id)");
    // Reuses the pre-existing gathering lock instead of a second flag
    // (mirrors T-01-02's note for the sibling Nhập kho page).
    expect(block).toContain("setGatheringLabels(true)");
    expect(block).toContain("setGatheringLabels(false)");
  });

  it("Xem (view) does not fetch full lines — the dialog pages them itself", () => {
    const block = extractBlock('id: "view"', '\n    },');
    // The explanatory comment mentions the helper by name; only the actual
    // invocation would defeat this test's purpose.
    expect(block).not.toContain("fetchGoodsIssueWithLines(selectedIssue.id)");
    expect(block).toContain("setEditingIssue(selectedIssue)");
  });
});

describe("error path never opens the dialog (AC-04 shape, no silent line wipe)", () => {
  it("duplicate and edit both toast on error and only call setDialogMode on the success branch", () => {
    for (const id of ['"duplicate"', '"edit"']) {
      const block = extractBlock(`id: ${id}`, '\n    },');
      const tryIndex = block.indexOf("try {");
      const catchIndex = block.indexOf("} catch (err) {");
      const finallyIndex = block.indexOf("} finally {");
      expect(tryIndex).toBeGreaterThan(-1);
      expect(catchIndex).toBeGreaterThan(tryIndex);
      expect(finallyIndex).toBeGreaterThan(catchIndex);

      const trySection = block.slice(tryIndex, catchIndex);
      const catchSection = block.slice(catchIndex, finallyIndex);

      // setDialogMode only runs after a successful fetch, inside `try`.
      expect(trySection).toContain("setDialogMode");
      // The catch branch reports the error and does not open a dialog.
      expect(catchSection).not.toContain("setDialogMode");
      expect(catchSection).toContain("toast.error(getUserFacingApiErrorMessage(err))");
    }
  });
});
