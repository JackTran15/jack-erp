export enum REPORT_FILTERS_LINE {
    STORE = 'store',
    REPORT_PERIOD = 'report_period',
    RANGE_DATE = 'range_date',
    CHECKBOX_STATISTIC_BY_BRAND = 'statistic_by_brand',
}

export const REPORT_FILTERS_LINE_METADATA = {
    [REPORT_FILTERS_LINE.STORE]: {
        label: 'cửa hàng',
        backendField: 'storeId',
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
}