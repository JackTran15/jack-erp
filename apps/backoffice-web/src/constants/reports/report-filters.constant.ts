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
}