import { ReportTableColumn, ReportTableColumnGroup } from "./report-column.constant";

export interface ReportColumnConfig {
  column: ReportTableColumn;
  visible?: boolean;
  fixed?: boolean;
  label?: string;
  backendField?: string;
  order: number;
  group?: ReportTableColumnGroup | null;
  number?: number;           
  formulaDisplay?: string;
}