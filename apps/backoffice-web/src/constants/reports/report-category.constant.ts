import { STORE_TYPE } from "../store.constant";
import { REPORT_TYPE_SALES } from "./report-type.constant";
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
  // [REPORT_CATEGORY.DEBTS]: {
  //   label: "Công nợ",
  //   url: "/reports/debts",
  // },
  // [REPORT_CATEGORY.CASH_FUND]: {
  //   label: "Quỹ tiền mặt",
  //   url: "/reports/cash-fund",
  // },
  // [REPORT_CATEGORY.PROFIT]: {
  //   label: "Lợi nhuận",
  //   url: "/reports/profit",
  // },
}