import { ReportPage } from "../pages/chain-store/reports/ReportPage";
import { StockByBranchReportPage } from "../pages/reports/storage/StockByBranchReportPage";
import { StockDocumentDetailsReportPage } from "../pages/reports/storage/StockDocumentDetailsReportPage";
import { StockQuantityDetailsReportPage } from "../pages/reports/storage/StockQuantityDetailsReportPage";
import { StockSummaryByBranchReportPage } from "../pages/reports/storage/StockSummaryByBranchReportPage";
import { StockSummaryReportPage } from "../pages/reports/storage/StockSummaryReportPage";
import { TemporaryIssuesReportPage } from "../pages/reports/storage/TemporaryIssuesReportPage";
import { TransferByBranchReportPage } from "../pages/reports/storage/TransferByBranchReportPage";
import { TransferSummaryReportPage } from "../pages/reports/storage/TransferSummaryReportPage";
import { REPORT_CATEGORY } from "./reports/report-category.constant";
import { REPORT_TYPE_INVENTORY } from "./reports/report-type.constant";
import { STORE_TYPE } from "./store.constant";

// Chain view: dùng chung ReportPage(category=INVENTORY), bind sẵn report type theo
// route để khi mở thẳng URL (chưa có hash) hiển thị đúng báo cáo của route đó.
const chainReportPage = (reportType: REPORT_TYPE_INVENTORY) => () =>
    <ReportPage category={REPORT_CATEGORY.INVENTORY} reportType={reportType} />

export const pageRegistry = {
    [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY]: {
        [STORE_TYPE.SINGLE]: StockSummaryReportPage,
        [STORE_TYPE.CHAIN]: chainReportPage(REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY)
    },
    // Bảng kê chi tiết phiếu nhập xuất kho
    [REPORT_TYPE_INVENTORY.WAREHOUSE_VOUCHER_DETAIL_LIST]: {
        [STORE_TYPE.SINGLE]: StockDocumentDetailsReportPage ,
        [STORE_TYPE.CHAIN]: chainReportPage(REPORT_TYPE_INVENTORY.WAREHOUSE_VOUCHER_DETAIL_LIST)
    },
    // Chi tiết số lượng nhập xuất tồn kho
    [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_QUANTITY_DETAIL]: {
        [STORE_TYPE.SINGLE]: StockQuantityDetailsReportPage,
        [STORE_TYPE.CHAIN]: chainReportPage(REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_QUANTITY_DETAIL)
    },
    // Tổng hợp nhập xuất tồn kho theo cửa hàng
    [REPORT_TYPE_INVENTORY.STORE_INVENTORY_IN_OUT_STOCK_SUMMARY]: {
        [STORE_TYPE.SINGLE]: StockSummaryByBranchReportPage,
        [STORE_TYPE.CHAIN]: chainReportPage(REPORT_TYPE_INVENTORY.STORE_INVENTORY_IN_OUT_STOCK_SUMMARY)
    },
    // Số lượng tồn kho theo cửa hàng
    [REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE]: {
        [STORE_TYPE.SINGLE]: StockByBranchReportPage,
        [STORE_TYPE.CHAIN]: chainReportPage(REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE)
    },
    // Tổng hợp nhập xuất điều chuyển
    [REPORT_TYPE_INVENTORY.TRANSFER_IN_OUT_SUMMARY]: {
        [STORE_TYPE.SINGLE]: TransferSummaryReportPage,
        [STORE_TYPE.CHAIN]: chainReportPage(REPORT_TYPE_INVENTORY.TRANSFER_IN_OUT_SUMMARY)
    },
    // Tổng hợp hàng hóa đã điều chuyển theo cửa hàng
    [REPORT_TYPE_INVENTORY.TRANSFERRED_GOODS_SUMMARY_BY_STORE]: {
        [STORE_TYPE.SINGLE]: TransferByBranchReportPage,
        [STORE_TYPE.CHAIN]: chainReportPage(REPORT_TYPE_INVENTORY.TRANSFERRED_GOODS_SUMMARY_BY_STORE)
    },
    // Hàng hóa xuất kho tạm
    [REPORT_TYPE_INVENTORY.TEMPORARY_WAREHOUSE_OUT_GOODS]: {
        [STORE_TYPE.SINGLE]: TemporaryIssuesReportPage,
        [STORE_TYPE.CHAIN]: chainReportPage(REPORT_TYPE_INVENTORY.TEMPORARY_WAREHOUSE_OUT_GOODS)
    }
}

export type PageKey = keyof typeof pageRegistry;

// Map report type kho → route (khớp App.tsx). Dùng cho dropdown chọn báo cáo tạm
// ở store view; sẽ gộp khi refactor báo cáo kho sang dynamic store view.
export const STORAGE_REPORT_PATHS: Partial<Record<REPORT_TYPE_INVENTORY, string>> = {
    [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY]: "/reports/storage/stock-summary",
    [REPORT_TYPE_INVENTORY.WAREHOUSE_VOUCHER_DETAIL_LIST]: "/reports/storage/stock-document-details",
    [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_QUANTITY_DETAIL]: "/reports/storage/stock-quantity-details",
    [REPORT_TYPE_INVENTORY.STORE_INVENTORY_IN_OUT_STOCK_SUMMARY]: "/reports/storage/stock-summary-by-branch",
    [REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE]: "/reports/storage/stock-by-branch",
    [REPORT_TYPE_INVENTORY.TRANSFER_IN_OUT_SUMMARY]: "/reports/storage/transfer-summary",
    [REPORT_TYPE_INVENTORY.TRANSFERRED_GOODS_SUMMARY_BY_STORE]: "/reports/storage/transfer-by-branch",
    [REPORT_TYPE_INVENTORY.TEMPORARY_WAREHOUSE_OUT_GOODS]: "/reports/storage/temporary-issues",
}