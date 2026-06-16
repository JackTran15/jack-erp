import { ReportTableColumn } from "../../../../constants/reports/report-table.constant";

export type ReportRow = Partial<Record<ReportTableColumn, number | string>>;

// Dữ liệu mock tĩnh tái dựng đúng ảnh spec (chỉ 1 dòng kết quả 03/06/2026).
// Mọi cột không liệt kê mặc định hiển thị 0.
export const dailySalesSummaryRows: ReportRow[] = [
  {
    [ReportTableColumn.DATE]: "03/06/2026",
    [ReportTableColumn.REVENUE_TOTAL]: 17000000,
    [ReportTableColumn.REVENUE_GOODS]: 17000000,
    [ReportTableColumn.PAYMENT_CASH]: 13600000,
    [ReportTableColumn.NET_REVENUE]: 13600000,
  },
];

// Vì chỉ có 1 dòng nên dòng tổng trùng giá trị với dòng dữ liệu.
export const dailySalesSummaryTotals: ReportRow = {
  [ReportTableColumn.REVENUE_TOTAL]: 17000000,
  [ReportTableColumn.REVENUE_GOODS]: 17000000,
  [ReportTableColumn.PAYMENT_CASH]: 13600000,
  [ReportTableColumn.NET_REVENUE]: 13600000,
};
