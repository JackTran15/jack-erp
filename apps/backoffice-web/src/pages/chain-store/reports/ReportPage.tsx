import { useMemo } from "react";
import {
  REPORT_CATEGORY,
  REPORT_CATEGORY_METADATA,
} from "../../../constants/reports/report-category.constant";
import { REPORT_BRANCH } from "../../../constants/reports/report.constant";
import { useIsChainSelected } from "../../../store/common/branch/branch.store";
import { TableStoreProvider } from "../../../store/common/table-store/table.context";
import { buildInitialTableState } from "../../../store/common/table-store/table.factory";
import { ReportStoreProvider } from "../../../store/page-stores/report/report.context";
import { buildInitialReportState } from "../../../store/page-stores/report/report.factory";
import { ReportPageHeader } from "./ReportPageHeader/ReportPageHeader";
import { ReportPageTable } from "./ReportPageTable/ReportPageTable";

interface Props {
  category: REPORT_CATEGORY;
}

export function ReportPage({ category }: Props) {
  const isChain = useIsChainSelected();
  const branch = isChain ? REPORT_BRANCH.CHAIN : REPORT_BRANCH.SINGLE;
  const configs = REPORT_CATEGORY_METADATA[category]?.configs?.[branch];

  const tableInitialState = useMemo(
    () =>
      configs
        ? buildInitialTableState(`${category}-${branch}`, configs.tableConfig)
        : null,
    [category, branch, configs],
  );
  const reportInitialState = useMemo(
    () =>
      configs ? buildInitialReportState({ category, branch, configs }) : null,
    [category, branch, configs],
  );

  if (!configs || !tableInitialState || !reportInitialState) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Báo cáo chưa được cấu hình.
      </div>
    );
  }

  return (
    <ReportStoreProvider
      key={`${category}-${branch}`}
      initialState={reportInitialState}
    >
      <TableStoreProvider
        key={`${category}-${branch}`}
        initialState={tableInitialState}
      >
        <div className="flex h-full flex-col bg-white px-2">
          <ReportPageHeader />
          <ReportPageTable />
        </div>
      </TableStoreProvider>
    </ReportStoreProvider>
  );
}
