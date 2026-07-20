import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import { ReportColumnConfig, ReportTableConfig } from "../report.interface";

const columns: ReportColumnConfig[] = [
  {
    column: ReportTableColumn.SKU,
    backendField: "sku",
    label: "Mã SKU",
    order: 1,
    visible: true,
    tableConfig: { width: 110, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.PRODUCT_NAME,
    backendField: "productName",
    label: "Tên hàng hóa",
    order: 2,
    visible: true,
    tableConfig: { width: 200, align: "left", dataType: "text", link: true },
  },
  {
    column: ReportTableColumn.UNIT,
    backendField: "unit",
    label: "Đơn vị tính",
    order: 3,
    visible: true,
    tableConfig: { width: 80, align: "left", dataType: "text" },
  },
  {
    // Chỉ áp dụng ở "Thống kê theo" = Hàng hoá (statBy=item) VÀ khi filter
    // "Cửa hàng" resolve đúng 1 cửa hàng — BE bỏ 2 cột này khỏi catalog ở
    // grain Mẫu mã/Nhóm hàng hóa hoặc khi đang xem nhiều/mọi cửa hàng.
    // Registry này chỉ là fallback dự phòng (nguồn sự thật là GET
    // /reports/invoices/columns?reportType=revenue-by-item&statBy=...).
    column: ReportTableColumn.LOCATION,
    backendField: "locationName",
    label: "Vị trí",
    order: 4,
    visible: true,
    tableConfig: { width: 110, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.LOCATION_CODE,
    backendField: "locationCode",
    label: "Mã vị trí",
    order: 5,
    visible: true,
    tableConfig: { width: 110, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.QUANTITY_SOLD,
    backendField: "quantitySold",
    label: "Số lượng bán",
    order: 6,
    number: 1,
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.UNIT_PRICE,
    backendField: "averagePrice",
    label: "Đơn giá TB",
    order: 7,
    number: 2,
    formulaDisplay: "(2)=(3)/(1)",
    visible: true,
    tableConfig: { width: 120 },
  },
  {
    column: ReportTableColumn.REVENUE_GOODS,
    backendField: "revenueGoods",
    label: "Tiền hàng",
    order: 8,
    number: 3,
    visible: true,
    tableConfig: { width: 120 },
  },
  {
    column: ReportTableColumn.REVENUE_PROMOTION,
    backendField: "revenuePromotion",
    label: "Khuyến mại",
    order: 9,
    number: 4,
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.DISCOUNT_POINT,
    backendField: "discountPoint",
    label: "Điểm KM",
    order: 10,
    number: 9,
    visible: true,
    tableConfig: { width: 90 },
  },
  {
    column: ReportTableColumn.DISCOUNT_RATE,
    backendField: "discountRate",
    label: "Tỷ lệ KM (%)",
    order: 11,
    number: 5,
    formulaDisplay: "(5)=((4)+(9))/(3)",
    visible: true,
    tableConfig: { width: 100 },
  },
  {
    column: ReportTableColumn.REVENUE_TOTAL,
    backendField: "revenueTotal",
    label: "Doanh thu",
    order: 12,
    number: 6,
    formulaDisplay: "(6)=(3)-(4)-(9)",
    visible: true,
    tableConfig: { width: 120 },
  },
  {
    column: ReportTableColumn.PRODUCT_GROUP,
    backendField: "productGroup",
    label: "Nhóm hàng hóa",
    order: 13,
    visible: true,
    tableConfig: { width: 140, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.PRODUCT_BRAND,
    backendField: "productBrand",
    label: "Thương hiệu",
    order: 14,
    visible: true,
    tableConfig: { width: 140, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.SUPPLIER_NAME,
    backendField: "supplierName",
    label: "Nhà cung cấp",
    order: 15,
    visible: true,
    tableConfig: { width: 150, align: "left", dataType: "text" },
  },
];

export const single_tableRegistryReportRevenueByProduct: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

// "Vị trí"/"Mã vị trí" là dữ liệu phụ thuộc việc resolve đúng 1 cửa hàng — ở
// chế độ Chuỗi cửa hàng khi đang gộp nhiều/mọi cửa hàng vào 1 dòng, không có
// 1 vị trí duy nhất để hiển thị. Registry này chỉ là fallback dự phòng; BE đã
// tự loại 2 cột này khỏi catalog thật khi filter "Cửa hàng" không resolve về
// đúng 1 cửa hàng (kể cả khi vẫn ở chế độ Chuỗi cửa hàng).
export const chain_tableRegistryReportRevenueByProduct: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns: columns.filter(
    (c) =>
      c.column !== ReportTableColumn.LOCATION &&
      c.column !== ReportTableColumn.LOCATION_CODE,
  ),
};

export const single_filterRegistryReportRevenueByProduct = [
  REPORT_FILTERS_LINE.STORE,
  REPORT_FILTERS_LINE.PRODUCT_TYPE,
  REPORT_FILTERS_LINE.STATISTIC_BY,
  REPORT_FILTERS_LINE.PRODUCT_GROUP,
  REPORT_FILTERS_LINE.BRAND,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
  REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND,
  REPORT_FILTERS_LINE.CHECKBOX_ALLOCATE_COMBO,
];

export const chain_filterRegistryReportRevenueByProduct = [
  REPORT_FILTERS_LINE.STORE,
  REPORT_FILTERS_LINE.PRODUCT_TYPE,
  REPORT_FILTERS_LINE.STATISTIC_BY,
  REPORT_FILTERS_LINE.PRODUCT_GROUP,
  REPORT_FILTERS_LINE.BRAND,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
  REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND,
  REPORT_FILTERS_LINE.CHECKBOX_ALLOCATE_COMBO,
];
