import { REPORT_BRANCH } from "./report-branch.constant";
import { REPORT_FILTERS_LINE } from "./report-filters.constant";
import { chain_filterRegistryReportDailySaleSummary, chain_tableRegistryReportDailySaleSummary, single_filterRegistryReportDailySaleSummary, single_tableRegistryReportDailySaleSummary } from "./report-registry/report-daily-sale-summary.registry";
import { chain_filterRegistryReportInvoiceAndOrderList, chain_tableRegistryReportInvoiceAndOrderList, single_filterRegistryReportInvoiceAndOrderList, single_tableRegistryReportInvoiceAndOrderList } from "./report-registry/report-invoice-and-order-list.registry";
import type { ReportTableConfig, ReportTypeMetadata } from "./report.interface";

export enum REPORT_TYPE_SALES {
  DAILY_SALES_SUMMARY = 'daily_sales_summary',
  INVOICE_AND_ORDER_LIST = 'invoice_and_order_list',
  PROMOTIONAL_INVOICE_LIST = 'promotional_invoice_list',
  PROMOTION_BY_INVOICE_AND_PRODUCT = 'promotion_by_invoice_and_product',
  REVENUE_DETAIL_BY_INVOICE_AND_PRODUCT = 'revenue_detail_by_invoice_and_product',
  REVENUE_BY_TIME = 'revenue_by_time',
  REVENUE_BY_PRODUCT = 'revenue_by_product',
  REVENUE_BY_EMPLOYEE = 'revenue_by_employee',
  REVENUE_BY_CUSTOMER = 'revenue_by_customer',
  REVENUE_BY_PRODUCT_AND_PROMOTION = 'revenue_by_product_and_promotion',
  PRODUCT_REVENUE_COMPARISON_BY_TIME = 'product_revenue_comparison_by_time',
  BRANCH_REVENUE_COMPARISON_BY_TIME = 'branch_revenue_comparison_by_time',
  STORE_TRANSFER_SUMMARY = 'store_transfer_summary',
  DELIVERY_QUANTITY = 'delivery_quantity',
  PRODUCT_PRICE_FLUCTUATION = 'product_price_fluctuation',
  EMPLOYEE_CUSTOMER_REVENUE_BY_PRODUCT = 'employee_customer_revenue_by_product',
  EMPLOYEE_REVENUE_BY_CUSTOMER = 'employee_revenue_by_customer',
  COMMISSION_BY_EMPLOYEE = 'commission_by_employee',
  DISCOUNT_COST_SUMMARY = 'discount_cost_summary',
}

export const REPORT_TYPE_SALES_METADATA = {
  [REPORT_TYPE_SALES.DAILY_SALES_SUMMARY]: {
    label: 'Tổng hợp bán hàng theo ngày',
    backendKey: 'daily-sales-summary',
    filterConfig: {
      [REPORT_BRANCH.SINGLE]: single_filterRegistryReportDailySaleSummary,
      [REPORT_BRANCH.CHAIN]: chain_filterRegistryReportDailySaleSummary
    },
    tableConfig: {
      [REPORT_BRANCH.SINGLE]: single_tableRegistryReportDailySaleSummary,
      [REPORT_BRANCH.CHAIN]: chain_tableRegistryReportDailySaleSummary
    },
  },
  [REPORT_TYPE_SALES.INVOICE_AND_ORDER_LIST]: {
    label: 'Bảng kê hóa đơn và đơn hàng',
    backendKey: 'invoice-order-listing',
    tableConfig: {
      [REPORT_BRANCH.SINGLE]: single_tableRegistryReportInvoiceAndOrderList,
      [REPORT_BRANCH.CHAIN]: chain_tableRegistryReportInvoiceAndOrderList
    },
   filterConfig: {
      [REPORT_BRANCH.SINGLE]: single_filterRegistryReportInvoiceAndOrderList,
      [REPORT_BRANCH.CHAIN]: chain_filterRegistryReportInvoiceAndOrderList
    },
  },
  [REPORT_TYPE_SALES.REVENUE_DETAIL_BY_INVOICE_AND_PRODUCT]: { label: 'Chi tiết doanh thu theo hóa đơn và mặt hàng', backendKey: 'invoice-item-revenue-detail' },
  [REPORT_TYPE_SALES.REVENUE_BY_PRODUCT]: { label: 'Doanh thu theo mặt hàng', backendKey: 'revenue-by-item' },
  [REPORT_TYPE_SALES.PROMOTIONAL_INVOICE_LIST]: { label: 'Danh sách hóa đơn khuyến mại' },
  [REPORT_TYPE_SALES.PROMOTION_BY_INVOICE_AND_PRODUCT]: { label: 'Khuyến mãi theo hóa đơn và hàng hóa' },
  [REPORT_TYPE_SALES.REVENUE_BY_TIME]: { label: 'Doanh thu theo thời gian' },
  [REPORT_TYPE_SALES.REVENUE_BY_PRODUCT_AND_PROMOTION]: { label: 'Doanh thu theo mặt hàng và khuyến mãi' },
  [REPORT_TYPE_SALES.PRODUCT_REVENUE_COMPARISON_BY_TIME]: { label: 'So sánh doanh thu mặt hàng theo thời gian' },
  [REPORT_TYPE_SALES.REVENUE_BY_EMPLOYEE]: { label: 'Doanh thu theo nhân viên' },
  [REPORT_TYPE_SALES.REVENUE_BY_CUSTOMER]: { label: 'Doanh thu theo khách hàng' },
  [REPORT_TYPE_SALES.STORE_TRANSFER_SUMMARY]: { label: 'Tổng hợp điều chuyển đơn hàng theo cửa hàng' },
  [REPORT_TYPE_SALES.BRANCH_REVENUE_COMPARISON_BY_TIME]: { label: 'So sánh doanh thu theo chi nhánh và thời gian' },
  [REPORT_TYPE_SALES.DELIVERY_QUANTITY]: { label: 'Sổ giao hàng' },
  [REPORT_TYPE_SALES.PRODUCT_PRICE_FLUCTUATION]: { label: 'Biến động giá hàng hóa' },
  [REPORT_TYPE_SALES.EMPLOYEE_CUSTOMER_REVENUE_BY_PRODUCT]: { label: 'Doanh thu theo nhân viên, khách hàng theo hàng hóa' },
  [REPORT_TYPE_SALES.EMPLOYEE_REVENUE_BY_CUSTOMER]: { label: 'Doanh thu theo nhân viên theo khách hàng' },
  [REPORT_TYPE_SALES.COMMISSION_BY_EMPLOYEE]: { label: 'Hoa hồng theo nhân viên' },
  [REPORT_TYPE_SALES.DISCOUNT_COST_SUMMARY]: { label: 'Tổng hợp chi phí chiết khấu và giảm giá' },
}

export enum REPORT_TYPE_MULTI_CHANNEL_SALES {
  REVENUE_PROFIT_BY_CHANNEL = 'revenue_profit_by_channel',
  PRODUCT_REVENUE_COMPARISON_BY_CHANNEL = 'product_revenue_comparison_by_channel',
  CHANNEL_REVENUE_COMPARISON_BY_TIME = 'channel_revenue_comparison_by_time',
  REVENUE_PROFIT_DETAIL_BY_INVOICE_AND_PRODUCT = 'revenue_profit_detail_by_invoice_and_product',
}

export enum REPORT_TYPE_PURCHASES {
  PURCHASES_BY_PRODUCT = 'purchases_by_product',
  PURCHASES_BY_SUPPLIER = 'purchases_by_supplier',
  PURCHASE_DETAIL_LEDGER = 'purchase_detail_ledger',
}

export enum REPORT_TYPE_INVENTORY {
  INVENTORY_IN_OUT_STOCK_SUMMARY = 'inventory_in_out_stock_summary',
  WAREHOUSE_VOUCHER_DETAIL_LIST = 'warehouse_voucher_detail_list',
  INVENTORY_IN_OUT_STOCK_QUANTITY_DETAIL = 'inventory_in_out_stock_quantity_detail',
  STORE_INVENTORY_IN_OUT_STOCK_SUMMARY = 'store_inventory_in_out_stock_summary',
  STOCK_QUANTITY_BY_STORE = 'stock_quantity_by_store',
  STOCK_QUANTITY_BY_WAREHOUSE = 'stock_quantity_by_warehouse',
  STOCK_BELOW_MINIMUM_LEVEL = 'stock_below_minimum_level',
  TRANSFER_IN_OUT_SUMMARY = 'transfer_in_out_summary',
  TRANSFERRED_GOODS_SUMMARY_BY_STORE = 'transferred_goods_summary_by_store',
  TEMPORARY_WAREHOUSE_TRANSFER_SUMMARY = 'temporary_warehouse_transfer_summary',
  TEMPORARY_WAREHOUSE_OUT_GOODS = 'temporary_warehouse_out_goods',
  GOODS_STORAGE_TIME = 'goods_storage_time',
  GOODS_OUT_BY_REASON = 'goods_out_by_reason',
}

export enum REPORT_TYPE_DEBTS {
  RECEIVABLES_DETAIL_BY_PRODUCT = 'receivables_detail_by_product',
  AGING_RECEIVABLES_SUMMARY = 'aging_receivables_summary',
  SUPPLIER_DEBTS = 'supplier_debts',
  SUPPLIER_DEBTS_DETAIL_BY_DOCUMENT_AND_PRODUCT = 'supplier_debts_detail_by_document_and_product',
  DELIVERY_PARTNER_DEBTS = 'delivery_partner_debts',
}

export enum REPORT_TYPE_CASH_FUND {
  SHIFT_HANDOVER_MINUTES_LIST = 'shift_handover_minutes_list',
  CASH_IN_OUT_SITUATION = 'cash_in_out_situation',
  CASH_IN_OUT_LIST = 'cash_in_out_list',
  EXPENSES_BY_CATEGORY = 'expenses_by_category',
  EXPENSE_LIST_BY_CATEGORY = 'expense_list_by_category',
  EXPENSES_BY_TIME = 'expenses_by_time',
}

export enum REPORT_TYPE_PROFIT {
  BUSINESS_RESULTS = 'business_results',
  BUSINESS_RESULTS_BY_BRANCH = 'business_results_by_branch',
  PROFIT_BY_PRODUCT = 'profit_by_product',
  GROSS_PROFIT_BY_INVOICE = 'gross_profit_by_invoice',
}



export const REPORT_TYPE_PROFIT_METADATA = {
  [REPORT_TYPE_PROFIT.BUSINESS_RESULTS]: { label: 'Kết quả kinh doanh' },
  [REPORT_TYPE_PROFIT.BUSINESS_RESULTS_BY_BRANCH]: { label: 'Kết quả kinh doanh theo chi nhánh' },
  [REPORT_TYPE_PROFIT.PROFIT_BY_PRODUCT]: { label: 'Lợi nhuận theo mặt hàng' },
  [REPORT_TYPE_PROFIT.GROSS_PROFIT_BY_INVOICE]: { label: 'Lợi nhuận gộp theo hóa đơn' },
};

export const REPORT_TYPE_MULTI_CHANNEL_SALES_METADATA = {
  [REPORT_TYPE_MULTI_CHANNEL_SALES.REVENUE_PROFIT_BY_CHANNEL]: { label: 'Doanh thu, lợi nhuận theo kênh bán' },
  [REPORT_TYPE_MULTI_CHANNEL_SALES.PRODUCT_REVENUE_COMPARISON_BY_CHANNEL]: { label: 'So sánh doanh thu mặt hàng theo kênh bán' },
  [REPORT_TYPE_MULTI_CHANNEL_SALES.CHANNEL_REVENUE_COMPARISON_BY_TIME]: { label: 'So sánh doanh thu theo kênh bán và thời gian' },
  [REPORT_TYPE_MULTI_CHANNEL_SALES.REVENUE_PROFIT_DETAIL_BY_INVOICE_AND_PRODUCT]: { label: 'Chi tiết doanh thu, lợi nhuận theo hóa đơn và mặt hàng' },
};

export const REPORT_TYPE_PURCHASES_METADATA = {
  [REPORT_TYPE_PURCHASES.PURCHASES_BY_PRODUCT]: { label: 'Mua hàng theo mặt hàng' },
  [REPORT_TYPE_PURCHASES.PURCHASES_BY_SUPPLIER]: { label: 'Mua hàng theo nhà cung cấp' },
  [REPORT_TYPE_PURCHASES.PURCHASE_DETAIL_LEDGER]: { label: 'Sổ chi tiết mua hàng' },
};

export const REPORT_TYPE_INVENTORY_METADATA = {
  [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY]: { label: 'Tổng hợp nhập xuất tồn kho' },
  [REPORT_TYPE_INVENTORY.WAREHOUSE_VOUCHER_DETAIL_LIST]: { label: 'Bảng kê chi tiết phiếu kho' },
  [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_QUANTITY_DETAIL]: { label: 'Chi tiết số lượng nhập xuất tồn kho' },
  [REPORT_TYPE_INVENTORY.STORE_INVENTORY_IN_OUT_STOCK_SUMMARY]: { label: 'Tổng hợp nhập xuất tồn kho theo cửa hàng' },
  [REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE]: { label: 'Số lượng tồn kho theo cửa hàng' },
  [REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_WAREHOUSE]: { label: 'Số lượng tồn kho theo kho' },
  [REPORT_TYPE_INVENTORY.STOCK_BELOW_MINIMUM_LEVEL]: { label: 'Hàng hóa có tồn kho dưới mức tối thiểu' },
  [REPORT_TYPE_INVENTORY.TRANSFER_IN_OUT_SUMMARY]: { label: 'Tổng hợp nhập xuất điều chuyển' },
  [REPORT_TYPE_INVENTORY.TRANSFERRED_GOODS_SUMMARY_BY_STORE]: { label: 'Tổng hợp hàng hóa đã điều chuyển theo cửa hàng' },
  [REPORT_TYPE_INVENTORY.TEMPORARY_WAREHOUSE_TRANSFER_SUMMARY]: { label: 'Tổng hợp điều chuyển kho tạm' },
  [REPORT_TYPE_INVENTORY.TEMPORARY_WAREHOUSE_OUT_GOODS]: { label: 'Hàng hóa xuất kho tạm' },
  [REPORT_TYPE_INVENTORY.GOODS_STORAGE_TIME]: { label: 'Thời gian lưu kho hàng hóa' },
  [REPORT_TYPE_INVENTORY.GOODS_OUT_BY_REASON]: { label: 'Hàng hóa xuất kho theo lý do' },
};

export const REPORT_TYPE_DEBTS_METADATA = {
  [REPORT_TYPE_DEBTS.RECEIVABLES_DETAIL_BY_PRODUCT]: { label: 'Chi tiết công nợ phải thu theo mặt hàng' },
  [REPORT_TYPE_DEBTS.AGING_RECEIVABLES_SUMMARY]: { label: 'Tổng hợp công nợ phải thu theo độ tuổi' },
  [REPORT_TYPE_DEBTS.SUPPLIER_DEBTS]: { label: 'Công nợ nhà cung cấp' },
  [REPORT_TYPE_DEBTS.SUPPLIER_DEBTS_DETAIL_BY_DOCUMENT_AND_PRODUCT]: { label: 'Chi tiết công nợ nhà cung cấp theo chứng từ và mặt hàng' },
  [REPORT_TYPE_DEBTS.DELIVERY_PARTNER_DEBTS]: { label: 'Công nợ đối tác giao hàng' },
};

export const REPORT_TYPE_CASH_FUND_METADATA = {
  [REPORT_TYPE_CASH_FUND.SHIFT_HANDOVER_MINUTES_LIST]: { label: 'Biên bản bàn giao ca' },
  [REPORT_TYPE_CASH_FUND.CASH_IN_OUT_SITUATION]: { label: 'Tình hình thu chi quỹ tiền mặt' },
  [REPORT_TYPE_CASH_FUND.CASH_IN_OUT_LIST]: { label: 'Danh sách thu chi quỹ tiền mặt' },
  [REPORT_TYPE_CASH_FUND.EXPENSES_BY_CATEGORY]: { label: 'Chi phí theo loại' },
  [REPORT_TYPE_CASH_FUND.EXPENSE_LIST_BY_CATEGORY]: { label: 'Danh sách chi phí theo loại' },
  [REPORT_TYPE_CASH_FUND.EXPENSES_BY_TIME]: { label: 'Chi phí theo thời gian' },
};

// Gộp metadata của mọi category để tra cứu theo giá trị report type (string).
// Thêm report mới = thêm vào metadata của report đó (vd REPORT_TYPE_SALES_METADATA).
export const REPORT_TYPE_METADATA: Record<string, ReportTypeMetadata> = {
  ...REPORT_TYPE_SALES_METADATA,
  ...REPORT_TYPE_MULTI_CHANNEL_SALES_METADATA,
  ...REPORT_TYPE_PURCHASES_METADATA,
  ...REPORT_TYPE_INVENTORY_METADATA,
  ...REPORT_TYPE_DEBTS_METADATA,
  ...REPORT_TYPE_CASH_FUND_METADATA,
  ...REPORT_TYPE_PROFIT_METADATA,
};

// Nhãn hiển thị của một report type (đọc trực tiếp từ metadata).
export function getReportTypeLabel(reportType: string): string {
  return REPORT_TYPE_METADATA[reportType]?.label ?? reportType;
}

// Khóa report type phía backend (kebab) — undefined nếu type chưa được BE hỗ trợ.
export function getReportBackendKey(reportType: string): string | undefined {
  return REPORT_TYPE_METADATA[reportType]?.backendKey;
}

// Các dòng filter của report type đang chọn theo loại view (dòng chọn báo cáo "TYPE"
// được render riêng, luôn hiển thị, ở ReportFilterForm — không nằm trong danh sách này).
export function getReportFormLines(
  reportType: string,
  branch: REPORT_BRANCH,
): REPORT_FILTERS_LINE[] {
  return REPORT_TYPE_METADATA[reportType]?.filterConfig?.[branch] ?? [];
}

const EMPTY_TABLE_CONFIG: ReportTableConfig = { columns: [] };

// Table config theo report type + loại view; rỗng nếu report chưa cấu hình bảng.
export function getReportTableConfig(
  reportType: string,
  branch: REPORT_BRANCH,
): ReportTableConfig {
  return REPORT_TYPE_METADATA[reportType]?.tableConfig?.[branch] ?? EMPTY_TABLE_CONFIG;
}