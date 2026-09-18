import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import { ReportColumnConfig, ReportTableConfig } from "../report.interface";

// 4 cột cố định — rows là khung "Khoản mục" I–IV do BE tính (I. Tiền đầu kỳ,
// II. Tiền thu trong kỳ → Thu từ bán hàng / mục thu / Thu khác, III. Tiền chi
// trong kỳ → Chi mua hàng hóa / mục chi / Chi khác, IV. Tiền cuối kỳ), không
// phải 1 dòng/1 entity. Dòng đậm / thụt lề đi theo `bold`/`indentLevel` BE trả
// kèm trên mỗi row như Kết quả kinh doanh (ADR-04). Số dư tính trên ngày chứng
// từ, chỉ chứng từ đã ghi sổ (ADR-02). Nguồn sự thật thật sự là
// GET /reports/cash-fund/columns; đây là fallback (xem ReportTableConfigSync).
const columns: ReportColumnConfig[] = [
  {
    column: ReportTableColumn.LINE_LABEL,
    backendField: "lineLabel",
    order: 1,
    visible: true,
    tableConfig: {
      width: 320,
      pinned: "left",
      align: "left",
      dataType: "text",
      filterKind: "none",
    },
  },
  {
    column: ReportTableColumn.CASH_AMOUNT,
    backendField: "cash",
    order: 2,
    visible: true,
    tableConfig: { width: 160, link: true },
  },
  {
    column: ReportTableColumn.DEPOSIT_AMOUNT,
    backendField: "deposit",
    order: 3,
    visible: true,
    tableConfig: { width: 160, link: true },
  },
  {
    column: ReportTableColumn.TOTAL_AMOUNT,
    backendField: "total",
    order: 4,
    visible: true,
    tableConfig: { width: 160 },
  },
];

// KHÔNG có summaryLabel — dòng "IV. Tiền cuối kỳ" trong rows đã là dòng tổng;
// ReportPageTableView chỉ render <tfoot> khi summaryLabel có giá trị.
export const single_tableRegistryReportCashInOutSituation: ReportTableConfig = {
  columns,
};

export const chain_tableRegistryReportCashInOutSituation: ReportTableConfig = {
  columns,
};

// Không có filter cửa hàng: #2 lấy chi nhánh đang chọn trên header (A-14),
// ở chế độ Chuỗi BE gộp theo quyền hợp nhất.
export const single_filterRegistryReportCashInOutSituation = [
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];

export const chain_filterRegistryReportCashInOutSituation = [
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
