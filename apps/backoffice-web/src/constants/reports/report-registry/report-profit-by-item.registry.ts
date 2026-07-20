import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import { ReportColumnConfig, ReportTableConfig } from "../report.interface";

// Cột dự phòng (fallback) — nguồn sự thật là GET /reports/profit/columns?statBy=...
// (2 bộ cột khác nhau tuỳ "Thống kê theo" — xem TKT-PRF-02). Registry này chỉ
// khai báo bộ cột đầy đủ nhất (grain item/parent) làm lưới an toàn dự phòng.
const columns: ReportColumnConfig[] = [
  {
    column: ReportTableColumn.SKU,
    backendField: "skuCode",
    label: "Mã SKU",
    order: 1,
    visible: true,
    tableConfig: { width: 120, pinned: "left", align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.PRODUCT_NAME,
    backendField: "itemName",
    label: "Tên hàng hóa",
    order: 2,
    visible: true,
    tableConfig: { width: 200, pinned: "left", align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.UNIT,
    backendField: "unit",
    label: "Đơn vị tính",
    order: 3,
    visible: true,
    tableConfig: { width: 90, align: "left", dataType: "text" },
  },
  {
    // Chỉ áp dụng ở "Thống kê theo" = Hàng hoá (statBy=item) — BE bỏ cột này
    // khỏi catalog ở grain Mẫu mã/Nhóm hàng hóa (1 dòng gộp nhiều item, không
    // có 1 vị trí duy nhất). Registry này chỉ là fallback dự phòng.
    column: ReportTableColumn.LOCATION,
    backendField: "location",
    label: "Vị trí",
    order: 4,
    visible: true,
    tableConfig: { width: 110, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.QUANTITY_SOLD,
    backendField: "quantity",
    label: "Số lượng bán",
    order: 5,
    number: 1,
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.REVENUE_TOTAL,
    backendField: "revenue",
    label: "Doanh thu",
    order: 6,
    number: 3,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.COST_OF_GOODS,
    backendField: "costOfGoods",
    order: 7,
    number: 5,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.GROSS_PROFIT,
    backendField: "grossProfit",
    order: 8,
    number: 6,
    formulaDisplay: "(6)=(3)-(5)",
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.PROFIT_PER_UNIT,
    backendField: "profitPerUnit",
    order: 9,
    number: 7,
    formulaDisplay: "(7)=(6)/(1)",
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.MARGIN_ON_REVENUE,
    backendField: "marginOnRevenue",
    order: 10,
    number: 8,
    formulaDisplay: "(8)=(6)/(3)",
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.MARGIN_ON_COST,
    backendField: "marginOnCost",
    order: 11,
    number: 9,
    formulaDisplay: "(9)=(6)/(5)",
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.PRODUCT_GROUP,
    backendField: "categoryName",
    label: "Tên nhóm hàng hóa",
    order: 12,
    visible: true,
    tableConfig: { width: 150, align: "left", dataType: "text" },
  },
];

export const single_tableRegistryReportProfitByItem: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

// "Vị trí" là dữ liệu 1-chi-nhánh (kho lưu trữ của 1 cửa hàng cụ thể) — ở chế
// độ Chuỗi cửa hàng (gộp nhiều/mọi cửa hàng vào 1 dòng), không có 1 vị trí
// duy nhất để hiển thị nên bỏ hẳn cột này.
export const chain_tableRegistryReportProfitByItem: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns: columns.filter((c) => c.column !== ReportTableColumn.LOCATION),
};

// Chế độ 1 chi nhánh: không có filter "Cửa hàng" phụ (đã ở ngữ cảnh 1 chi nhánh).
export const single_filterRegistryReportProfitByItem = [
  REPORT_FILTERS_LINE.STATISTIC_BY,
  REPORT_FILTERS_LINE.PRODUCT_GROUP,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];

// Chế độ Chuỗi cửa hàng: có filter "Cửa hàng" phụ, mặc định gộp toàn chuỗi.
export const chain_filterRegistryReportProfitByItem = [
  REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL,
  REPORT_FILTERS_LINE.STATISTIC_BY,
  REPORT_FILTERS_LINE.PRODUCT_GROUP,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
