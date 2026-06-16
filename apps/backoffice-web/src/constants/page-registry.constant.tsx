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

const ChainReportPage = () => <ReportPage category={REPORT_CATEGORY.INVENTORY} />

export const pageRegistry = {
    [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY]: {
        [STORE_TYPE.SINGLE]: StockSummaryReportPage,
        [STORE_TYPE.CHAIN]: ChainReportPage
    },
    // Bảng kê chi tiết phiếu nhập xuất kho
    [REPORT_TYPE_INVENTORY.WAREHOUSE_VOUCHER_DETAIL_LIST]: {
        [STORE_TYPE.SINGLE]: StockDocumentDetailsReportPage ,
        [STORE_TYPE.CHAIN]: ChainReportPage
    },
    // Chi tiết số lượng nhập xuất tồn kho
    [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_QUANTITY_DETAIL]: {
        [STORE_TYPE.SINGLE]: StockQuantityDetailsReportPage,
        [STORE_TYPE.CHAIN]: ChainReportPage
    },
    // Tổng hợp nhập xuất tồn kho theo cửa hàng
    [REPORT_TYPE_INVENTORY.STORE_INVENTORY_IN_OUT_STOCK_SUMMARY]: {
        [STORE_TYPE.SINGLE]: StockSummaryByBranchReportPage,
        [STORE_TYPE.CHAIN]: ChainReportPage
    },
    // Số lượng tồn kho theo cửa hàng
    [REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE]: {
        [STORE_TYPE.SINGLE]: StockByBranchReportPage,
        [STORE_TYPE.CHAIN]: ChainReportPage
    },
    // Tổng hợp nhập xuất điều chuyển
    [REPORT_TYPE_INVENTORY.TRANSFER_IN_OUT_SUMMARY]: {
        [STORE_TYPE.SINGLE]: TransferSummaryReportPage,
        [STORE_TYPE.CHAIN]: ChainReportPage
    },
    // Tổng hợp hàng hóa đã điều chuyển theo cửa hàng
    [REPORT_TYPE_INVENTORY.TRANSFERRED_GOODS_SUMMARY_BY_STORE]: {
        [STORE_TYPE.SINGLE]: TransferByBranchReportPage,
        [STORE_TYPE.CHAIN]: ChainReportPage
    },
    // Hàng hóa xuất kho tạm
    [REPORT_TYPE_INVENTORY.TEMPORARY_WAREHOUSE_OUT_GOODS]: {
        [STORE_TYPE.SINGLE]: TemporaryIssuesReportPage,
        [STORE_TYPE.CHAIN]: ChainReportPage 
    }
}

export type PageKey = keyof typeof pageRegistry;