import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import { ReportColumnConfig, ReportTableConfig } from "../report.interface";

// 5 cột cố định — rows là danh mục "Khoản mục" cố định do BE tính (không phải
// 1 dòng/1 entity), xem TKT-PRF-04/TKT-PRF-10. "Khoản mục" hiển thị theo cấp
// bậc (indent/bold) qua field `indentLevel`/`bold` BE trả kèm trên mỗi row —
// không phải "cột" theo nghĩa ReportColumnHeader (xem ReportPageTableView).
const columns: ReportColumnConfig[] = [
  {
    column: ReportTableColumn.LINE_ITEM_LABEL,
    backendField: "khoanMuc",
    order: 1,
    visible: true,
    tableConfig: { width: 320, pinned: "left", align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.PERIOD_PREVIOUS,
    backendField: "kyTruoc",
    order: 2,
    visible: true,
    tableConfig: { width: 150 },
  },
  {
    column: ReportTableColumn.PERIOD_CURRENT,
    backendField: "kyHienTai",
    order: 3,
    visible: true,
    tableConfig: { width: 150 },
  },
  {
    column: ReportTableColumn.PERIOD_CHANGE_PERCENT,
    backendField: "thayDoiPercent",
    order: 4,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.PERIOD_CHANGE_AMOUNT,
    backendField: "thayDoiSoTien",
    order: 5,
    visible: true,
    tableConfig: { width: 150 },
  },
];

// KHÔNG có summaryLabel — báo cáo này không có dòng Tổng ở footer (dòng
// "IV. Lợi nhuận" trong rows đã là dòng tổng). ReportPageTableView chỉ render
// <tfoot> khi summaryLabel có giá trị (xem TKT-PRF-10).
export const single_tableRegistryReportBusinessResults: ReportTableConfig = {
  columns,
};

export const chain_tableRegistryReportBusinessResults: ReportTableConfig = {
  columns,
};

export const single_filterRegistryReportBusinessResults = [
  REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS,
  REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE,
  REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT,
  REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE,
];

export const chain_filterRegistryReportBusinessResults = [
  REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL,
  REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS,
  REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE,
  REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT,
  REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE,
];
