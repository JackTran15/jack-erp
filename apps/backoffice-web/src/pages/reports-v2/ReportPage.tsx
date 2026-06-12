import { ReportDailySaleSummaryTableRegistry } from "../../constants/reports/report-table-registry/table-daily-sale-summary.registry";
import { ReportPageHeader } from "./ReportPageHeader/ReportPageHeader";
import { ReportPageTable } from "./ReportPageTable/ReportPageTable";
import {
  dailySalesSummaryRows,
  dailySalesSummaryTotals,
} from "./_mock/report-daily-sales.mock";

export function ReportPage() {
  return (
    <div className="flex h-full flex-col bg-white px-2">
      <ReportPageHeader />
      <ReportPageTable
        config={ReportDailySaleSummaryTableRegistry}
        rows={dailySalesSummaryRows}
        totals={dailySalesSummaryTotals}
      />
    </div>
  );
}
