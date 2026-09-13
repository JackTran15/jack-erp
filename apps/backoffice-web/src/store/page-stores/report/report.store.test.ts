import { describe, expect, it } from "vitest";
import { REPORT_CATEGORY } from "../../../constants/reports/report-category.constant";
import { REPORT_FILTERS_LINE } from "../../../constants/reports/report-filters.constant";
import {
  getReportBackendKey,
  getReportFormLines,
  REPORT_TYPE_INVENTORY,
  REPORT_TYPE_PROFIT,
  REPORT_TYPE_SALES,
} from "../../../constants/reports/report-type.constant";
import { STORE_TYPE } from "../../../constants/store.constant";
import { buildInventorySearchFilters } from "../../../pages/chain-store/reports/_api/inventory-report-v2.api";
import { buildSearchFilters } from "../../../pages/chain-store/reports/_api/invoice-report.api";
import { buildInitialReportState } from "./report.factory";
import { createReportStore } from "./report.store";

// "Số lượng tồn kho theo cửa hàng" is the only warehouse report with a
// "Thương hiệu" line; "Tổng hợp nhập xuất tồn kho" has none but its backend
// still honours `brand` — which is exactly how a stale value went invisible.
const WITH_BRAND = REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE;
const WITHOUT_BRAND = REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY;

const INVENTORY_REPORTS = [
  REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY,
  REPORT_TYPE_INVENTORY.WAREHOUSE_VOUCHER_DETAIL_LIST,
  REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_QUANTITY_DETAIL,
  REPORT_TYPE_INVENTORY.STORE_INVENTORY_IN_OUT_STOCK_SUMMARY,
  REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE,
];

const SALES_REPORTS = [
  REPORT_TYPE_SALES.DAILY_SALES_SUMMARY,
  REPORT_TYPE_SALES.INVOICE_AND_ORDER_LIST,
  REPORT_TYPE_SALES.REVENUE_DETAIL_BY_INVOICE_AND_PRODUCT,
  REPORT_TYPE_SALES.REVENUE_BY_PRODUCT,
];

function salesStore(
  branch: STORE_TYPE,
  reportType = REPORT_TYPE_SALES.REVENUE_BY_PRODUCT,
) {
  return createReportStore(
    buildInitialReportState({
      category: REPORT_CATEGORY.SALES,
      branch,
      configs: { listReport: SALES_REPORTS },
      reportType,
    }),
  );
}

function inventoryStore(branch: STORE_TYPE, reportType = WITH_BRAND) {
  return createReportStore(
    buildInitialReportState({
      category: REPORT_CATEGORY.INVENTORY,
      branch,
      configs: { listReport: INVENTORY_REPORTS },
      reportType,
    }),
  );
}

describe("setReportType prunes the filter bar", () => {
  it("drops a filter the new report has no line for", () => {
    const store = inventoryStore(STORE_TYPE.SINGLE);
    store.getState().actions.setFilterValue(REPORT_FILTERS_LINE.BRAND, "Giay MT");
    expect(store.getState().filters[REPORT_FILTERS_LINE.BRAND]).toBe("Giay MT");

    store.getState().actions.setReportType(WITHOUT_BRAND);

    expect(store.getState().filters[REPORT_FILTERS_LINE.BRAND]).toBeUndefined();
  });

  it("keeps a filter both reports declare", () => {
    const store = inventoryStore(STORE_TYPE.SINGLE);
    store
      .getState()
      .actions.setFilterValue(REPORT_FILTERS_LINE.PRODUCT_GROUP, "cat-1");

    store.getState().actions.setReportType(WITHOUT_BRAND);

    expect(store.getState().filters[REPORT_FILTERS_LINE.PRODUCT_GROUP]).toBe(
      "cat-1",
    );
  });

  it("keeps the period, which every report reads but the seed owns", () => {
    const store = inventoryStore(STORE_TYPE.SINGLE);
    const before = store.getState().filters[REPORT_FILTERS_LINE.RANGE_DATE];

    store.getState().actions.setReportType(WITHOUT_BRAND);

    expect(store.getState().filters[REPORT_FILTERS_LINE.REPORT_PERIOD]).toBe(
      "today",
    );
    expect(store.getState().filters[REPORT_FILTERS_LINE.RANGE_DATE]).toEqual(
      before,
    );
  });

  it("keeps the drill-down SKU scope, which no report renders", () => {
    const store = inventoryStore(STORE_TYPE.SINGLE);
    store.getState().actions.setFilterValue(REPORT_FILTERS_LINE.SKU, "SKU-1");

    store.getState().actions.setReportType(WITHOUT_BRAND);

    expect(store.getState().filters[REPORT_FILTERS_LINE.SKU]).toBe("SKU-1");
  });

  it("keeps the two comparison periods seeded for the profit group", () => {
    const store = createReportStore(
      buildInitialReportState({
        category: REPORT_CATEGORY.PROFIT,
        branch: STORE_TYPE.SINGLE,
        configs: {
          listReport: [
            REPORT_TYPE_PROFIT.BUSINESS_RESULTS,
            REPORT_TYPE_PROFIT.PROFIT_BY_ITEM,
          ],
        },
        reportType: REPORT_TYPE_PROFIT.PROFIT_BY_ITEM,
      }),
    );

    store
      .getState()
      .actions.setReportType(REPORT_TYPE_PROFIT.BUSINESS_RESULTS);

    const filters = store.getState().filters;
    expect(filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS]).toBe(
      "last_month",
    );
    expect(
      filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE],
    ).toBeDefined();
  });

  it("snapshots the pruned filters when the chain view auto-applies", () => {
    const store = inventoryStore(STORE_TYPE.CHAIN);
    store.getState().actions.setFilterValue(REPORT_FILTERS_LINE.BRAND, "Giay MT");

    store.getState().actions.setReportType(WITHOUT_BRAND);

    const applied = store.getState().appliedRequest;
    expect(applied?.reportType).toBe(WITHOUT_BRAND);
    expect(applied?.filters[REPORT_FILTERS_LINE.BRAND]).toBeUndefined();
  });

  it("leaves the branch view waiting for an explicit apply", () => {
    const store = inventoryStore(STORE_TYPE.SINGLE);

    store.getState().actions.setReportType(WITHOUT_BRAND);

    expect(store.getState().appliedRequest).toBeNull();
  });
});

// ADR-04: "Số lượng tồn kho theo cửa hàng" reads `stock_balances` — a stock
// level as of now, with no time axis — so its registry no longer declares the
// two period lines (T-04-01). The seed in `buildInitialReportState` still puts
// them in the bag for every report, and `ALWAYS_KEPT_FILTER_LINES` deliberately
// carries them through the prune. That combination is what these tests pin:
// dropping the lines from ONE registry must not empty the period of any other
// report, and must not leave the pivot quietly shipping a period the engine
// never reads.
describe("dropping the pivot's period lines (AC-10)", () => {
  const PIVOT = REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE;

  it("leaves the period of another report intact across a round trip", () => {
    const store = inventoryStore(STORE_TYPE.SINGLE, WITHOUT_BRAND);
    store
      .getState()
      .actions.setFilterValue(REPORT_FILTERS_LINE.REPORT_PERIOD, "this_year");
    const period = store.getState().filters[REPORT_FILTERS_LINE.REPORT_PERIOD];
    const range = store.getState().filters[REPORT_FILTERS_LINE.RANGE_DATE];

    store.getState().actions.setReportType(PIVOT);
    store.getState().actions.setReportType(WITHOUT_BRAND);

    expect(store.getState().filters[REPORT_FILTERS_LINE.REPORT_PERIOD]).toBe(
      period,
    );
    expect(store.getState().filters[REPORT_FILTERS_LINE.RANGE_DATE]).toEqual(
      range,
    );
  });

  it("still renders the period line on the seven other warehouse reports", () => {
    for (const reportType of INVENTORY_REPORTS.filter((r) => r !== PIVOT)) {
      const lines = getReportFormLines(reportType, STORE_TYPE.SINGLE);
      expect(lines).toContain(REPORT_FILTERS_LINE.REPORT_PERIOD);
      expect(lines).toContain(REPORT_FILTERS_LINE.RANGE_DATE);
    }
  });

  it("renders neither period line on the pivot itself (AC-09)", () => {
    for (const branch of [STORE_TYPE.SINGLE, STORE_TYPE.CHAIN]) {
      const lines = getReportFormLines(PIVOT, branch);
      expect(lines).not.toContain(REPORT_FILTERS_LINE.REPORT_PERIOD);
      expect(lines).not.toContain(REPORT_FILTERS_LINE.RANGE_DATE);
    }
  });

  it("sends no period or preset in the pivot's payload", () => {
    const store = inventoryStore(STORE_TYPE.SINGLE, PIVOT);

    const payload = buildInventorySearchFilters(store.getState().filters, {
      branch: STORE_TYPE.SINGLE,
      activeBranchId: "branch-1",
      backendKey: "inventory-stock-by-store-pivot",
    });

    expect(payload.period).toBeUndefined();
    expect(payload.preset).toBeUndefined();
  });

  it("still sends the period in every other warehouse report's payload", () => {
    for (const reportType of INVENTORY_REPORTS.filter((r) => r !== PIVOT)) {
      const store = inventoryStore(STORE_TYPE.SINGLE, reportType);
      const payload = buildInventorySearchFilters(store.getState().filters, {
        branch: STORE_TYPE.SINGLE,
        activeBranchId: "branch-1",
        backendKey: getReportBackendKey(reportType) as string,
      });
      expect(payload.period).toBeDefined();
    }
  });
});

// P1 / ADR-01: the 4 Sales reports never sent the header branch, so BE fell
// back to the whole org for anyone with the consolidated-read permission.
// `buildSearchFilters` now pins `store` to the header branch in SINGLE mode,
// mirroring the warehouse reports' pin in `inventory-report-v2.api.ts:105-113`.
describe("buildSearchFilters pins store to the header branch (P1, AC-03/AC-06)", () => {
  const GROUP_A_B = { scope: "group" as const, storeIds: ["store-a", "store-b"] };

  it("pins all 4 Sales reports to the header branch even when state holds another store group", () => {
    for (const reportType of SALES_REPORTS) {
      const store = salesStore(STORE_TYPE.SINGLE, reportType);
      store
        .getState()
        .actions.setFilterValue(REPORT_FILTERS_LINE.STORE, GROUP_A_B);

      const payload = buildSearchFilters(store.getState().filters, {
        branch: STORE_TYPE.SINGLE,
        activeBranchId: "branch-1",
        backendKey: getReportBackendKey(reportType) as string,
      });

      expect(payload.store).toEqual({ scope: "group", storeIds: ["branch-1"] });
    }
  });

  it("keeps the user's own store selection in CHAIN mode even though a header branch id is set", () => {
    // Chain mode only flips isChain; branchId still holds the last single
    // branch, so real callers pass a non-null activeBranchId here (AC-05).
    for (const reportType of SALES_REPORTS) {
      const store = salesStore(STORE_TYPE.CHAIN, reportType);
      store
        .getState()
        .actions.setFilterValue(REPORT_FILTERS_LINE.STORE, GROUP_A_B);

      const payload = buildSearchFilters(store.getState().filters, {
        branch: STORE_TYPE.CHAIN,
        activeBranchId: "branch-1",
        backendKey: getReportBackendKey(reportType) as string,
      });

      expect(payload.store).toEqual(GROUP_A_B);
    }
  });

  it("does not pin when SINGLE has no active branch id", () => {
    const store = salesStore(STORE_TYPE.SINGLE);
    store
      .getState()
      .actions.setFilterValue(REPORT_FILTERS_LINE.STORE, GROUP_A_B);

    const payload = buildSearchFilters(store.getState().filters, {
      branch: STORE_TYPE.SINGLE,
      activeBranchId: null,
      backendKey: getReportBackendKey(
        REPORT_TYPE_SALES.REVENUE_BY_PRODUCT,
      ) as string,
    });

    expect(payload.store).toEqual(GROUP_A_B);
  });

  it("does not pin an invoice backend key outside the allowlist", () => {
    const store = salesStore(STORE_TYPE.SINGLE);
    store
      .getState()
      .actions.setFilterValue(REPORT_FILTERS_LINE.STORE, GROUP_A_B);

    const payload = buildSearchFilters(store.getState().filters, {
      branch: STORE_TYPE.SINGLE,
      activeBranchId: "branch-1",
      backendKey: "invoice-report-outside-allowlist",
    });

    expect(payload.store).toEqual(GROUP_A_B);
  });
});

// T-01-02, AC-01/AC-05: now that SINGLE mode always pins `store` to the
// header branch (above), the "Cửa hàng" line is redundant there — it stayed
// only where CHAIN mode still needs the user to choose a store group.
describe("Sales reports drop the STORE line in SINGLE mode (AC-01/AC-05)", () => {
  it("does not render STORE in SINGLE mode but keeps it in CHAIN mode", () => {
    for (const reportType of SALES_REPORTS) {
      expect(getReportFormLines(reportType, STORE_TYPE.SINGLE)).not.toContain(
        REPORT_FILTERS_LINE.STORE,
      );
      expect(getReportFormLines(reportType, STORE_TYPE.CHAIN)).toContain(
        REPORT_FILTERS_LINE.STORE,
      );
    }
  });
});
