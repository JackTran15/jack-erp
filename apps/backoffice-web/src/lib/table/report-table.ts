import { ReportColumnConfig } from "../../constants/reports/report.interface";

// Bề rộng mặc định khi cột không khai báo `width` trong registry.
export const DEFAULT_REPORT_COLUMN_WIDTH = 112;

const numberFormatter = new Intl.NumberFormat("vi-VN");

export type ReportTableSegment =
  | { kind: "single"; col: ReportColumnConfig }
  | { kind: "group"; label: string; cols: ReportColumnConfig[] };

// Gộp các cột liên tiếp cùng `group` thành một segment (header tầng 1 dùng colSpan);
// cột không có group đứng riêng (rowSpan).
export function buildReportColumnSegments(cols: ReportColumnConfig[]): ReportTableSegment[] {
  const segments: ReportTableSegment[] = [];
  for (const col of cols) {
    const group = col.group ?? null;
    if (!group) {
      segments.push({ kind: "single", col });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last && last.kind === "group" && last.label === group) {
      last.cols.push(col);
    } else {
      segments.push({ kind: "group", label: group, cols: [col] });
    }
  }
  return segments;
}

// Mã công thức cột, vd "(1)=(3)+(4)-(5)-(14)" hoặc "(3)"; null khi cột không có số thứ tự.
export function getReportColumnCode(col: ReportColumnConfig): string | null {
  // Cột từ API: không có `number`, `formulaDisplay` là chuỗi code đầy đủ (vd "(1)=(3)-(5)-(14)").
  if (!col.number) return col.formulaDisplay ?? null;
  return col.formulaDisplay ? `(${col.number})=${col.formulaDisplay}` : `(${col.number})`;
}

export function getReportColumnWidth(col: ReportColumnConfig): number {
  return col.tableConfig?.width ?? DEFAULT_REPORT_COLUMN_WIDTH;
}

// dataType không khai báo ⇒ coi như cột số (đa số cột báo cáo là số tiền).
export function isReportNumberColumn(col: ReportColumnConfig): boolean {
  return (col.tableConfig?.dataType ?? "number") === "number";
}

// Lề ô dữ liệu: ưu tiên `align`, mặc định suy ra từ dataType (số → phải, còn lại → trái).
export function getReportCellAlignClass(col: ReportColumnConfig): string {
  const align = col.tableConfig?.align ?? (isReportNumberColumn(col) ? "right" : "left");
  if (align === "right") return "text-right tabular-nums";
  if (align === "center") return "text-center";
  return "text-left";
}

export function formatReportNumber(value: unknown): string {
  return numberFormatter.format(typeof value === "number" ? value : 0);
}
