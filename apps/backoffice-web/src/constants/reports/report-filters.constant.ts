export enum REPORT_FILTERS_LINE {
    STORE = 'store',
    INVOICE_STATUS = 'invoice_status',
    STAT_DATE_TYPE = 'stat_date_type',
    REPORT_PERIOD = 'report_period',
    RANGE_DATE = 'range_date',
    CHECKBOX_STATISTIC_BY_BRAND = 'statistic_by_brand',
    CASHIER = 'cashier',
    SALESPERSON = 'salesperson',
    CUSTOMER = 'customer',
    WAREHOUSE = 'warehouse',
    PRODUCT_GROUP = 'product_group',
    STATISTIC_BY = 'statistic_by',
    UNIT = 'unit',
    BRAND = 'brand',
    WORK_SHIFT = 'work_shift',
    SOURCE_STORE = 'source_store',
    RECEIVING_STORE = 'receiving_store',
    STORE_SINGLE = 'store_single',
    PRODUCT_TYPE = 'product_type',
    CHECKBOX_ALLOCATE_COMBO = 'allocate_combo_revenue',
}

export const REPORT_FILTERS_LINE_METADATA = {
    [REPORT_FILTERS_LINE.STORE]: {
        label: 'cửa hàng',
        backendField: 'storeId',
    },
    [REPORT_FILTERS_LINE.INVOICE_STATUS]: {
        label: 'trạng thái HĐ',
        backendField: 'invoiceStatus',
    },
    [REPORT_FILTERS_LINE.STAT_DATE_TYPE]: {
        label: 'ngày thống kê',
        backendField: 'statDateType',
    },
    [REPORT_FILTERS_LINE.REPORT_PERIOD]: {
        label: 'kỳ báo cáo',
        backendField: 'reportPeriod',
    },
    [REPORT_FILTERS_LINE.RANGE_DATE]: {
        label: 'Từ ngày',
        backendField: 'fromDate',
        label2: 'Đến ngày',
        backendField2: 'toDate',
    },
    [REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND]: {
        backendField: 'statisticByBrand',
    },
    [REPORT_FILTERS_LINE.CASHIER]: {
        label: 'NV thu ngân',
        isRequired: true,
        backendField: 'cashierId',
    },
    [REPORT_FILTERS_LINE.SALESPERSON]: {
        label: 'NV bán hàng',
        isRequired: true,
        backendField: 'salespersonId',
    },
    [REPORT_FILTERS_LINE.CUSTOMER]: {
        label: 'khách hàng',
        isRequired: true,
        backendField: 'customerId',
    },
    [REPORT_FILTERS_LINE.WAREHOUSE]: {
        label: 'kho',
        backendField: 'warehouseId',
    },
    [REPORT_FILTERS_LINE.PRODUCT_GROUP]: {
        label: 'nhóm hàng hóa',
        backendField: 'categoryId',
    },
    [REPORT_FILTERS_LINE.STATISTIC_BY]: {
        label: 'thống kê theo',
        backendField: 'statBy',
    },
    [REPORT_FILTERS_LINE.UNIT]: {
        label: 'đơn vị tính',
        backendField: 'unit',
    },
    [REPORT_FILTERS_LINE.BRAND]: {
        label: 'thương hiệu',
        backendField: 'brand',
    },
    [REPORT_FILTERS_LINE.WORK_SHIFT]: {
        label: 'ca làm việc',
        backendField: 'workShift',
    },
    [REPORT_FILTERS_LINE.SOURCE_STORE]: {
        label: 'cửa hàng xuất',
        backendField: 'sourceStoreId',
    },
    [REPORT_FILTERS_LINE.RECEIVING_STORE]: {
        label: 'cửa hàng nhận',
        backendField: 'receivingStoreId',
    },
    [REPORT_FILTERS_LINE.STORE_SINGLE]: {
        label: 'cửa hàng',
        isRequired: true,
        backendField: 'branchId',
    },
    [REPORT_FILTERS_LINE.PRODUCT_TYPE]: {
        label: 'loại hàng hóa',
        backendField: 'productType',
    },
    [REPORT_FILTERS_LINE.CHECKBOX_ALLOCATE_COMBO]: {
        backendField: 'allocateComboRevenue',
    },
}