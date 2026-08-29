import { describe, expect, it } from "vitest";
import { REPORT_CATEGORY } from "../../../constants/reports/report-category.constant";
import { REPORT_FILTERS_LINE } from "../../../constants/reports/report-filters.constant";
import {
  REPORT_TYPE_INVENTORY,
  REPORT_TYPE_PROFIT,
} from "../../../constants/reports/report-type.constant";
import { STORE_TYPE } from "../../../constants/store.constant";
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
