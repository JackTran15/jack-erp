import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  REPORT_CATEGORY,
  REPORT_CATEGORY_METADATA,
} from "../../../constants/reports/report-category.constant";
import { useIsChainSelected } from "../../../store/common/branch/branch.store";
import { TableStoreProvider } from "../../../store/common/table-store/table.context";
import { buildInitialTableState } from "../../../store/common/table-store/table.factory";
import { ReportStoreProvider } from "../../../store/page-stores/report/report.context";
import { buildInitialReportState } from "../../../store/page-stores/report/report.factory";
import { InvoiceDetailDialog } from "./InvoiceDetailDialog/InvoiceDetailDialog";
import { ReportPageHeader } from "./ReportPageHeader/ReportPageHeader";
import { ReportPageTable } from "./ReportPageTable/ReportPageTable";
import { ReportColumnFilterSync } from "./ReportColumnFilterSync/ReportColumnFilterSync";
import { ReportTableConfigSync } from "./ReportTableConfigSync/ReportTableConfigSync";
import { ReportUrlSync } from "./ReportUrlSync/ReportUrlSync";
import { STORE_TYPE } from "../../../constants/store.constant";

interface Props {
  category: REPORT_CATEGORY;
  /** Report type mặc định theo route (vd báo cáo kho); dùng khi URL chưa có hash. */
  reportType?: string;
}

export function ReportPage({ category, reportType }: Props) {
  const isChain = useIsChainSelected();
  const branch = isChain ? STORE_TYPE.CHAIN : STORE_TYPE.SINGLE;
  const configs = REPORT_CATEGORY_METADATA[category]?.configs?.[branch];

  // Report type khởi tạo: ưu tiên URL hash (giữ trạng thái khi reload / chia sẻ
  // link), kế đến report type theo route, cuối cùng factory fallback listReport[0].
  const { hash } = useLocation();
  const hashReportType = decodeURIComponent(hash.replace(/^#/, ""));
  const initialReportType = (configs?.listReport ?? []).includes(hashReportType)
    ? hashReportType
    : reportType;

  // Columns nạp từ API (ReportTableConfigSync) → khởi tạo rỗng.
  const tableInitialState = useMemo(() => {
    if (!configs) return null;
    return buildInitialTableState(`${category}-${branch}`, { columns: [] });
  }, [category, branch, configs]);
  const reportInitialState = useMemo(
    () =>
      configs
        ? buildInitialReportState({
            category,
            branch,
            configs,
            reportType: initialReportType,
          })
        : null,
    [category, branch, configs, initialReportType],
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
        <ReportTableConfigSync />
        <ReportUrlSync />
        <ReportColumnFilterSync />
        <div className="flex h-full min-h-0 flex-col bg-background px-2">
          <ReportPageHeader />
          <ReportPageTable />
        </div>
        <InvoiceDetailDialog />
      </TableStoreProvider>
    </ReportStoreProvider>
  );
}
