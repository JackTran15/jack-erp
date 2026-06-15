import { useMemo } from "react";
import { reportDailySaleSummaryTableRegistry } from "../../../constants/reports/report-registry/report-daily-sale-summary.registry";
import { TableStoreProvider } from "../../../store/common/table-store/table.context";
import { buildInitialTableState } from "../../../store/common/table-store/table.factory";
import { ReportPageHeader } from "./ReportPageHeader/ReportPageHeader";
import { ReportPageTable } from "./ReportPageTable/ReportPageTable";

const TABLE_ID = "daily-sale-summary";

export function ReportPage() {
  const initialState = useMemo(
    () => buildInitialTableState(TABLE_ID, reportDailySaleSummaryTableRegistry),
    [],
  );

  return (
    <TableStoreProvider initialState={initialState}>
      <div className="flex h-full flex-col bg-white px-2">
        <ReportPageHeader />
        <ReportPageTable />
      </div>
    </TableStoreProvider>
  );
}
