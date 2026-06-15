import { REPORT_FILTERS_LINE } from "./report-filters.constant";
import { ReportTableColumn, ReportTableColumnGroup } from "./report-table.constant";
import { REPORT_BRANCH } from "./report.constant";

export type ReportColumnAlign = "left" | "right" | "center";
export type ReportColumnDataType = "date" | "number" | "text";
export type ReportColumnPin = "left" | "right";

// Render-config hiển thị cho từng cột (trước đây hardcode trong ReportPageTable).
export interface ReportColumnTableConfig {
  width?: number;                   // mặc định DEFAULT_REPORT_COLUMN_WIDTH ở lib/table
  pinned?: ReportColumnPin;         // pin cột trái/phải khi cuộn ngang
  align?: ReportColumnAlign;        // mặc định suy ra từ dataType
  dataType?: ReportColumnDataType;  // mặc định "number"; lái toán tử filter, icon lịch, format số
  link?: boolean;                   // render giá trị thành link xanh
}

export interface ReportColumnConfig {
  column: ReportTableColumn;
  order: number;
  label?: string;
  group?: ReportTableColumnGroup | null;
  visible?: boolean;
  backendField?: string;
  number?: number;
  formulaDisplay?: string;
  tableConfig?: ReportColumnTableConfig;  // gom nhóm các prop cấu hình hiển thị table
}

// Toàn bộ cấu hình của một bảng báo cáo (một file registry = một report).
export interface ReportTableConfig {
  columns: ReportColumnConfig[];
  summaryLabel?: string;            // nhãn ô đầu dòng footer, vd "Tổng"
}

export type ReportFiltersConfig = {
  [key in REPORT_BRANCH]?: {
    lines: REPORT_FILTERS_LINE[]; 
  }
}