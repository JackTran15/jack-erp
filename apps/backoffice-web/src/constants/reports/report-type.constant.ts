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

export const REPORT_TYPE_SALES_LABEL = {
  [REPORT_TYPE_SALES.DAILY_SALES_SUMMARY]: 'Tổng hợp bán hàng theo ngày',
  [REPORT_TYPE_SALES.INVOICE_AND_ORDER_LIST]: 'Bảng kê hóa đơn và đơn hàng',
  [REPORT_TYPE_SALES.PROMOTIONAL_INVOICE_LIST]: 'Danh sách hóa đơn khuyến mại',
  [REPORT_TYPE_SALES.PROMOTION_BY_INVOICE_AND_PRODUCT]: 'Khuyến mãi theo hóa đơn và hàng hóa',
  [REPORT_TYPE_SALES.REVENUE_DETAIL_BY_INVOICE_AND_PRODUCT]: 'Chi tiết doanh thu theo hóa đơn và mặt hàng',
  [REPORT_TYPE_SALES.REVENUE_BY_TIME]: 'Doanh thu theo thời gian',
  [REPORT_TYPE_SALES.REVENUE_BY_PRODUCT]: 'Doanh thu theo mặt hàng',
  [REPORT_TYPE_SALES.PRODUCT_REVENUE_COMPARISON_BY_TIME]: 'So sánh doanh thu mặt hàng theo thời gian',
  [REPORT_TYPE_SALES.REVENUE_BY_PRODUCT_AND_PROMOTION]: 'Doanh thu theo mặt hàng và khuyến mãi',
  [REPORT_TYPE_SALES.REVENUE_BY_EMPLOYEE]: 'Doanh thu theo nhân viên',
  [REPORT_TYPE_SALES.REVENUE_BY_CUSTOMER]: 'Doanh thu theo khách hàng',
  [REPORT_TYPE_SALES.STORE_TRANSFER_SUMMARY]: 'Tổng hợp điều chuyển đơn hàng theo cửa hàng',
  [REPORT_TYPE_SALES.BRANCH_REVENUE_COMPARISON_BY_TIME]: 'So sánh doanh thu theo chi nhánh và thời gian',
  [REPORT_TYPE_SALES.DELIVERY_QUANTITY]: 'Sổ giao hàng',
  [REPORT_TYPE_SALES.PRODUCT_PRICE_FLUCTUATION]: 'Biến động giá hàng hóa',
  [REPORT_TYPE_SALES.EMPLOYEE_CUSTOMER_REVENUE_BY_PRODUCT]: 'Doanh thu theo nhân viên, khách hàng theo hàng hóa',
  [REPORT_TYPE_SALES.EMPLOYEE_REVENUE_BY_CUSTOMER]: 'Doanh thu theo nhân viên theo khách hàng',
  [REPORT_TYPE_SALES.COMMISSION_BY_EMPLOYEE]: 'Hoa hồng theo nhân viên',
  [REPORT_TYPE_SALES.DISCOUNT_COST_SUMMARY]: 'Tổng hợp chi phí chiết khấu và giảm giá',
};

export const REPORT_TYPE_PROFIT_LABEL = {
  [REPORT_TYPE_PROFIT.BUSINESS_RESULTS]: 'Kết quả kinh doanh',
  [REPORT_TYPE_PROFIT.BUSINESS_RESULTS_BY_BRANCH]: 'Kết quả kinh doanh theo chi nhánh',
  [REPORT_TYPE_PROFIT.PROFIT_BY_PRODUCT]: 'Lợi nhuận theo mặt hàng',
  [REPORT_TYPE_PROFIT.GROSS_PROFIT_BY_INVOICE]: 'Lợi nhuận gộp theo hóa đơn',
};

export const REPORT_TYPE_MULTI_CHANNEL_SALES_LABEL = {
  [REPORT_TYPE_MULTI_CHANNEL_SALES.REVENUE_PROFIT_BY_CHANNEL]: 'Doanh thu, lợi nhuận theo kênh bán',
  [REPORT_TYPE_MULTI_CHANNEL_SALES.PRODUCT_REVENUE_COMPARISON_BY_CHANNEL]: 'So sánh doanh thu mặt hàng theo kênh bán',
  [REPORT_TYPE_MULTI_CHANNEL_SALES.CHANNEL_REVENUE_COMPARISON_BY_TIME]: 'So sánh doanh thu theo kênh bán và thời gian',
  [REPORT_TYPE_MULTI_CHANNEL_SALES.REVENUE_PROFIT_DETAIL_BY_INVOICE_AND_PRODUCT]: 'Chi tiết doanh thu, lợi nhuận theo hóa đơn và mặt hàng',
};

export const REPORT_TYPE_PURCHASES_LABEL = {
  [REPORT_TYPE_PURCHASES.PURCHASES_BY_PRODUCT]: 'Mua hàng theo mặt hàng',
  [REPORT_TYPE_PURCHASES.PURCHASES_BY_SUPPLIER]: 'Mua hàng theo nhà cung cấp',
  [REPORT_TYPE_PURCHASES.PURCHASE_DETAIL_LEDGER]: 'Sổ chi tiết mua hàng',
};

export const REPORT_TYPE_INVENTORY_LABEL = {
  [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY]: 'Tổng hợp nhập xuất tồn kho',
  [REPORT_TYPE_INVENTORY.WAREHOUSE_VOUCHER_DETAIL_LIST]: 'Bảng kê chi tiết phiếu kho',
  [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_QUANTITY_DETAIL]: 'Chi tiết số lượng nhập xuất tồn kho',
  [REPORT_TYPE_INVENTORY.STORE_INVENTORY_IN_OUT_STOCK_SUMMARY]: 'Tổng hợp nhập xuất tồn kho theo cửa hàng',
  [REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE]: 'Số lượng tồn kho theo cửa hàng',
  [REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_WAREHOUSE]: 'Số lượng tồn kho theo kho',
  [REPORT_TYPE_INVENTORY.STOCK_BELOW_MINIMUM_LEVEL]: 'Hàng hóa có tồn kho dưới mức tối thiểu',
  [REPORT_TYPE_INVENTORY.TRANSFER_IN_OUT_SUMMARY]: 'Tổng hợp nhập xuất điều chuyển',
  [REPORT_TYPE_INVENTORY.TRANSFERRED_GOODS_SUMMARY_BY_STORE]: 'Tổng hợp hàng hóa đã điều chuyển theo cửa hàng',
  [REPORT_TYPE_INVENTORY.TEMPORARY_WAREHOUSE_TRANSFER_SUMMARY]: 'Tổng hợp điều chuyển kho tạm',
  [REPORT_TYPE_INVENTORY.TEMPORARY_WAREHOUSE_OUT_GOODS]: 'Hàng hóa xuất kho tạm',
  [REPORT_TYPE_INVENTORY.GOODS_STORAGE_TIME]: 'Thời gian lưu kho hàng hóa',
  [REPORT_TYPE_INVENTORY.GOODS_OUT_BY_REASON]: 'Hàng hóa xuất kho theo lý do',
};

export const REPORT_TYPE_DEBTS_LABEL = {
  [REPORT_TYPE_DEBTS.RECEIVABLES_DETAIL_BY_PRODUCT]: 'Chi tiết công nợ phải thu theo mặt hàng',
  [REPORT_TYPE_DEBTS.AGING_RECEIVABLES_SUMMARY]: 'Tổng hợp công nợ phải thu theo độ tuổi',
  [REPORT_TYPE_DEBTS.SUPPLIER_DEBTS]: 'Công nợ nhà cung cấp',
  [REPORT_TYPE_DEBTS.SUPPLIER_DEBTS_DETAIL_BY_DOCUMENT_AND_PRODUCT]: 'Chi tiết công nợ nhà cung cấp theo chứng từ và mặt hàng',
  [REPORT_TYPE_DEBTS.DELIVERY_PARTNER_DEBTS]: 'Công nợ đối tác giao hàng',
};

export const REPORT_TYPE_CASH_FUND_LABEL = {
  [REPORT_TYPE_CASH_FUND.SHIFT_HANDOVER_MINUTES_LIST]: 'Biên bản bàn giao ca',
  [REPORT_TYPE_CASH_FUND.CASH_IN_OUT_SITUATION]: 'Tình hình thu chi quỹ tiền mặt',
  [REPORT_TYPE_CASH_FUND.CASH_IN_OUT_LIST]: 'Danh sách thu chi quỹ tiền mặt',
  [REPORT_TYPE_CASH_FUND.EXPENSES_BY_CATEGORY]: 'Chi phí theo loại',
  [REPORT_TYPE_CASH_FUND.EXPENSE_LIST_BY_CATEGORY]: 'Danh sách chi phí theo loại',
  [REPORT_TYPE_CASH_FUND.EXPENSES_BY_TIME]: 'Chi phí theo thời gian',
};