import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// useImportableTransferOrderCount is a react-query hook mounted in AppSidebar,
// MegaMenuPanel, and inventoryTabs.tsx; exercising the fetch/permission-gate
// behaviour needs a real DOM to render the hook, and this workspace has no
// jsdom/RTL (see CLAUDE.md). This test instead pins the exact source shape,
// so a regression (list endpoint creeping back in, permission gate dropped,
// query key or staleTime changed) fails CI instead of silently shipping
// (T-06-02, AC-22).
const hookSource = readFileSync(
  path.join(__dirname, "useImportableTransferOrderCount.ts"),
  "utf8",
);

describe("useImportableTransferOrderCount", () => {
  it("calls the count endpoint, not the full list endpoint", () => {
    expect(hookSource).toContain(
      '"/inventory/transfer-orders/importable/count"',
    );
    expect(hookSource).not.toContain(
      '"/inventory/transfer-orders/importable"',
    );
  });

  it("returns data.count, not data.length", () => {
    expect(hookSource).toContain("return data.count;");
    expect(hookSource).not.toContain("data.length");
  });

  it("gates on the route's own permission (inventory.transfer.read), not the tab's (inventory.transfer.import)", () => {
    expect(hookSource).toContain('"inventory.transfer.read"');
    expect(hookSource).not.toContain("inventory.transfer.import");
  });

  it("folds the permission check into enabled alongside the branch check", () => {
    const enabledLine = hookSource
      .split("\n")
      .find((line) => line.trim().startsWith("enabled:"));
    expect(enabledLine).toBeDefined();
    expect(enabledLine).toContain("activeBranchId");
    expect(enabledLine).toContain("canRead");
  });

  it("keeps the query key (with activeBranchId) and staleTime unchanged so the dialog's invalidation still matches", () => {
    expect(hookSource).toContain(
      '["inventory-transfer-orders-importable-count", activeBranchId]',
    );
    expect(hookSource).toContain("staleTime: 30_000");
  });
});
