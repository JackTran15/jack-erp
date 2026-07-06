import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import type { ReportColumnConfig, ReportTableConfig } from "../report.interface";

// Cụm cột (band) cho báo cáo tổng hợp nhập xuất tồn kho.
const GROUP = {
  OPENING: "Tồn đầu kỳ",
  IN: "Nhập trong kỳ",
  OUT: "Xuất trong kỳ",
  ENDING: "Tồn cuối kỳ",
  TRANSFER_OUT: "Đang chuyển đi",
  INCOMING: "Sắp nhận về",
} as const;

// Cột số: căn phải, dataType number. Cột tính/placeholder do fetcher set sẵn giá trị.
function qty(
  column: string,
  group: string,
  order: number,
  width = 110,
): ReportColumnConfig {
  return {
    column,
    group,
    backendField: column,
    label: "Số lượng",
    order,
    visible: true,
    tableConfig: { width, align: "right", dataType: "number" },
  };
}

function value(
  column: string,
  group: string,
  order: number,
  width = 130,
): ReportColumnConfig {
  return {
    column,
    group,
    backendField: column,
    label: "Giá trị",
    order,
    visible: true,
    tableConfig: { width, align: "right", dataType: "number" },
  };
}

const columns: ReportColumnConfig[] = [
  {
    column: "name",
    backendField: "name",
    label: "Tên hàng hóa",
    order: 1,
    visible: true,
    tableConfig: { width: 240, pinned: "left", dataType: "text" },
  },
  {
    column: "parentSku",
    backendField: "parentSku",
    label: "Mã SKU mẫu mã",
    order: 2,
    visible: true,
    tableConfig: { width: 140, dataType: "text" },
  },
  {
    column: "parentName",
    backendField: "parentName",
    label: "Tên Mẫu mã",
    order: 3,
    visible: true,
    tableConfig: { width: 160, dataType: "text" },
  },
  {
    column: "color",
    backendField: "color",
    label: "Màu sắc",
    order: 4,
    visible: true,
    tableConfig: { width: 100, dataType: "text" },
  },
  {
    column: "size",
    backendField: "size",
    label: "Size",
    order: 5,
    visible: true,
    tableConfig: { width: 80, dataType: "text" },
  },
  {
    column: "unit",
    backendField: "unit",
    label: "Đơn vị tính",
    order: 6,
    visible: true,
    tableConfig: { width: 110, dataType: "text" },
  },
  {
    column: "group",
    backendField: "group",
    label: "Nhóm hàng hóa",
    order: 7,
    visible: true,
    tableConfig: { width: 140, dataType: "text" },
  },
  {
    column: "brand",
    backendField: "brand",
    label: "Thương hiệu",
    order: 8,
    visible: true,
    tableConfig: { width: 120, dataType: "text" },
  },
  {
    column: "sku",
    backendField: "sku",
    label: "Mã SKU",
    order: 9,
    visible: true,
    tableConfig: { width: 140, dataType: "text" },
  },
  {
    column: "positionCode",
    backendField: "positionCode",
    label: "Mã vị trí",
    order: 10,
    visible: true,
    tableConfig: { width: 110, dataType: "text" },
  },
  {
    column: "positionName",
    backendField: "positionName",
    label: "Tên vị trí",
    order: 11,
    visible: true,
    tableConfig: { width: 110, dataType: "text" },
  },
  qty("openingQty", GROUP.OPENING, 12),
  value("openingValue", GROUP.OPENING, 13),
  qty("inQty", GROUP.IN, 14),
  value("inValue", GROUP.IN, 15),
  qty("outQty", GROUP.OUT, 16),
  value("outValue", GROUP.OUT, 17),
  qty("endingQty", GROUP.ENDING, 18),
  value("endingValue", GROUP.ENDING, 19, 140),
  qty("transferOutQty", GROUP.TRANSFER_OUT, 20),
  value("transferOutValue", GROUP.TRANSFER_OUT, 21),
  qty("incomingQty", GROUP.INCOMING, 22),
  value("incomingValue", GROUP.INCOMING, 23),
  {
    column: "supplier",
    backendField: "supplier",
    label: "Nhà cung cấp",
    order: 24,
    visible: true,
    tableConfig: { width: 160, dataType: "text" },
  },
];

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };

export const single_tableRegistryReportInventoryInOutStockSummary = tableConfig;
export const chain_tableRegistryReportInventoryInOutStockSummary = tableConfig;

// SINGLE (chi nhánh): cửa hàng cố định theo header → không có dòng Cửa hàng;
// CHAIN (chuỗi): thêm dòng Cửa hàng multi-select ở đầu.
const singleFilterLines = [
  REPORT_FILTERS_LINE.WAREHOUSE,
  REPORT_FILTERS_LINE.PRODUCT_GROUP,
  REPORT_FILTERS_LINE.STATISTIC_BY,
  REPORT_FILTERS_LINE.UNIT,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
const chainFilterLines = [REPORT_FILTERS_LINE.STORE, ...singleFilterLines];

export const single_filterRegistryReportInventoryInOutStockSummary = singleFilterLines;
export const chain_filterRegistryReportInventoryInOutStockSummary = chainFilterLines;
