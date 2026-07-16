import { STORE_TYPE } from "../store.constant";
import { REPORT_TYPE_DEBTS, REPORT_TYPE_INVENTORY, REPORT_TYPE_SALES } from "./report-type.constant";
import type { ReportCategoryMetadata } from "./report.interface";

export enum REPORT_CATEGORY {
  SALES = 'sales',
  MULTI_CHANNEL_SALES = 'multi_channel_sales',
  PURCHASES = 'purchases',
  INVENTORY = 'inventory',
  DEBTS = 'debts',
  CASH_FUND = 'cash_fund',
  PROFIT = 'profit',
}

// 4 báo cáo công nợ đã cấu hình (registry + fetcher) — xem docs/24-debt-reports-spec.md.
// "Tổng hợp công nợ phải thu theo tuổi nợ" và "Công nợ đối tác giao hàng" tạm hoãn
// (chưa có backendKey), không đưa vào danh sách.
const DEBT_REPORTS = [
  REPORT_TYPE_DEBTS.CUSTOMER_DEBTS,
  REPORT_TYPE_DEBTS.RECEIVABLES_DETAIL_BY_PRODUCT,
  REPORT_TYPE_DEBTS.SUPPLIER_DEBTS,
  REPORT_TYPE_DEBTS.SUPPLIER_DEBTS_DETAIL_BY_DOCUMENT_AND_PRODUCT,
];

// 8 báo cáo kho theo thứ tự hiển thị trong dropdown.
const STORAGE_REPORTS = [
  REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY,
  REPORT_TYPE_INVENTORY.WAREHOUSE_VOUCHER_DETAIL_LIST,
  REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_QUANTITY_DETAIL,
  REPORT_TYPE_INVENTORY.STORE_INVENTORY_IN_OUT_STOCK_SUMMARY,
  REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE,
  REPORT_TYPE_INVENTORY.TRANSFER_IN_OUT_SUMMARY,
  REPORT_TYPE_INVENTORY.TRANSFERRED_GOODS_SUMMARY_BY_STORE,
  REPORT_TYPE_INVENTORY.TEMPORARY_WAREHOUSE_OUT_GOODS,
];

export const REPORT_CATEGORY_METADATA: Partial<Record<REPORT_CATEGORY, ReportCategoryMetadata>> = {
  [REPORT_CATEGORY.SALES]: {
    label: "Bán hàng",
    url: "/reports/sales",
    configs: {
      [STORE_TYPE.SINGLE]: {
        listReport: Object.values(REPORT_TYPE_SALES),
      },
      [STORE_TYPE.CHAIN]: {
        listReport: Object.values(REPORT_TYPE_SALES),
      }
    }
  },
  [REPORT_CATEGORY.INVENTORY]: {
    label: "Kho",
    // Trang ReportPage generic (contract v2); trang legacy /reports/storage/* vẫn truy cập trực tiếp được.
    url: "/reports/inventory",
    configs: {
      // 8 báo cáo kho đã cấu hình (registry + fetcher).
      [STORE_TYPE.SINGLE]: { listReport: STORAGE_REPORTS },
      [STORE_TYPE.CHAIN]: { listReport: STORAGE_REPORTS },
    },
  },
  // [REPORT_CATEGORY.MULTI_CHANNEL_SALES]: {
  //   label: "Bán hàng đa kênh",
  //   url: "/reports/multi-channel-sales",
  // },
  // [REPORT_CATEGORY.PURCHASES]: {
  //   label: "Mua hàng",
  //   url: "/reports/purchases",
  // },
  // [REPORT_CATEGORY.INVENTORY]: {
  //   label: "Tồn kho",
  //   url: "/reports/inventory",
  // },
  [REPORT_CATEGORY.DEBTS]: {
    label: "Công nợ",
    url: "/reports/debts",
    configs: {
      [STORE_TYPE.SINGLE]: { listReport: DEBT_REPORTS },
      [STORE_TYPE.CHAIN]: { listReport: DEBT_REPORTS },
    },
  },
  // [REPORT_CATEGORY.CASH_FUND]: {
  //   label: "Quỹ tiền mặt",
  //   url: "/reports/cash-fund",
  // },
  // [REPORT_CATEGORY.PROFIT]: {
  //   label: "Lợi nhuận",
  //   url: "/reports/profit",
  // },
}