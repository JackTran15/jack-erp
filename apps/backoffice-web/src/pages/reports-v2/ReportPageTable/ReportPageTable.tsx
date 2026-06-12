import { ReportTableConfig } from "../../../constants/reports/report.interface";
import { ReportRow } from "../_mock/report-daily-sales.mock";
import { ReportPageTableView } from "./ReportPageTableView/ReportPageTableView";
import { ReportPageTablePagination } from "./ReportPageTablePagination/ReportPageTablePagination";

interface Props {
  config: ReportTableConfig;
  rows: ReportRow[];
  totals: ReportRow;
}

export function ReportPageTable({ config, rows, totals }: Props) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ReportPageTableView config={config} rows={rows} totals={totals} />
      <ReportPageTablePagination />
    </div>
  );
}
