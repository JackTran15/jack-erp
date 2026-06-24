import { STORE_TYPE } from "../store.constant";
import { REPORT_FILTERS_LINE } from "./report-filters.constant";

export type ReportColumnAlign = "left" | "right" | "center";
export type ReportColumnDataType = "date" | "number" | "text";
export type ReportColumnPin = "left" | "right";

// Kiểu ô filter của cột. Mặc định suy ra từ dataType (xem resolveReportColumnFilterKind);
// "time"/"select"/"none" phải khai báo tường minh trong registry.
export type ReportColumnFilterKind =
  | "text"
  | "number"
  | "date"
  | "time"
  | "select"
  | "none";

// Render-config hiển thị cho từng cột (trước đây hardcode trong ReportPageTable).
export interface ReportColumnTableConfig {
  width?: number;                   // mặc định DEFAULT_REPORT_COLUMN_WIDTH ở lib/table
  pinned?: ReportColumnPin;         // pin cột trái/phải khi cuộn ngang
  align?: ReportColumnAlign;        // mặc định suy ra từ dataType
  dataType?: ReportColumnDataType;  // mặc định "number"; lái toán tử filter, icon lịch, format số
  link?: boolean;                   // render giá trị thành link xanh
  filterKind?: ReportColumnFilterKind;            // override kiểu ô filter (mặc định suy từ dataType)
  filterOptions?: { value: string; label: string }[]; // options cho filterKind "select"
}

export interface ReportColumnConfig {
  // Khóa cột (string) — registry FE dùng enum ReportTableColumn (giá trị string),
  // columns từ API là khóa tự do ("revenue.total", "payment.method.<id>"…).
  column: string;
  order: number;
  label?: string;
  group?: string | null;        // nhãn band (registry: enum; API: group.name)
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

// Metadata của một loại report: nhãn + filter + table config (theo từng loại view).
export interface ReportTypeMetadata {
  label?: string;
  // Khóa report type phía backend (kebab) — chỉ type được BE hỗ trợ mới có.
  backendKey?: string;
  filterConfig?: Partial<Record<STORE_TYPE, REPORT_FILTERS_LINE[]>>;
  tableConfig?: Partial<Record<STORE_TYPE, ReportTableConfig>>;
}

// Config của một báo cáo theo loại cửa hàng (chi nhánh / chuỗi).
// tableConfig đã chuyển sang metadata từng report type (xem REPORT_TYPE_*_METADATA).
export interface ReportBranchConfig {
  listReport: string[];
}

// Metadata của một category báo cáo (gắn với route), kèm config theo từng branch.
export interface ReportCategoryMetadata {
  label: string;
  url: string;
  configs: Partial<Record<STORE_TYPE, ReportBranchConfig>>;
}

export interface IDropdownOption {
  value: any;
  label: string;
  metadata?: Record<string, any>;
}