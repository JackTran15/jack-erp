import { useMemo } from "react";
import { AppModal, Button } from "@erp/ui";
import { TableStoreProvider } from "../../../../store/common/table-store/table.context";
import { buildInitialTableState } from "../../../../store/common/table-store/table.factory";
import {
  ReportStoreProvider,
  useReportStore,
} from "../../../../store/page-stores/report/report.context";
import { buildDrillDownReportState } from "../../../../store/page-stores/report/report.factory";
import type { ReportDrillDown } from "../../../../store/page-stores/report/report.interface";
import { InvoiceDetailDialog } from "../InvoiceDetailDialog/InvoiceDetailDialog";
import { ReportColumnFilterSync } from "../ReportColumnFilterSync/ReportColumnFilterSync";
import { ReportExportButtons } from "../ReportPageHeader/ReportPageToolbar/ReportExportButtons/ReportExportButtons";
import { ReportDrillDownMount } from "./ReportDrillDownMount";
import { ReportPageTable } from "../ReportPageTable/ReportPageTable";
import { ReportTableConfigSync } from "../ReportTableConfigSync/ReportTableConfigSync";

interface Props {
  /** null = đóng. */
  drillDown: ReportDrillDown | null;
  onClose: () => void;
}

interface BodyProps {
  drillDown: ReportDrillDown;
  onClose: () => void;
}

/**
 * Thân dialog: một báo cáo đầy đủ chạy trên stack store LỒNG.
 *
 * Cố ý dựng lại đúng cây của `ReportPage`, trừ hai chỗ:
 *
 * - KHÔNG có `ReportUrlSync`. Nó ghi URL hash, nên mount ở đây sẽ kéo báo cáo
 *   cha nhảy sang report type của dialog ngay khi dialog đóng.
 * - KHÔNG có `ReportPageHeader`. Dialog không cho đổi report type hay đổi filter
 *   — phạm vi của nó do dòng vừa được click quyết định.
 *
 * `InvoiceDetailDialog` được mount lại ở ĐÂY, bên trong provider lồng: cái mount
 * ở `ReportPage` đọc `detailInvoice` của store cha, nên nếu thiếu cái này thì
 * click mã hoá đơn trong dialog sẽ không làm gì cả.
 */
function ReportDrillDownBody({ drillDown, onClose }: BodyProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="text-center">
        <div className="text-base font-semibold uppercase">{drillDown.title}</div>
        <div className="text-sm text-muted-foreground">{drillDown.subtitle}</div>
      </div>
      <ReportTableConfigSync />
      <ReportColumnFilterSync />
      <ReportPageTable />
      {/*
        Chân dialog nằm TRONG provider lồng, không dùng prop `footer` của
        AppModal: `ReportExportButtons` tự đọc store, nên đặt ngoài đây là xuất
        khẩu nhầm dữ liệu của báo cáo cha.
      */}
      <div className="flex items-center justify-end gap-2 border-t pt-2">
        <ReportExportButtons />
        <Button variant="outline" onClick={onClose}>
          Đóng
        </Button>
      </div>
      <InvoiceDetailDialog />
      {/*
        Mount lại chính cái mount của drill-down, bên trong provider lồng: nhờ
        đó một ô trong dialog này mở được dialog kế tiếp (L1 → L2 → L3).
        Đệ quy tự dừng — `drillDown` của tầng trong cùng là null nên
        `ReportDrillDownDialog` render `AppModal` rỗng và không dựng thêm thân
        nào nữa. z-index đã do `AppModal` xử lý bằng stack ở module scope.
      */}
      <ReportDrillDownMount />
    </div>
  );
}

export function ReportDrillDownDialog({ drillDown, onClose }: Props) {
  // Category + branch kế thừa từ store cha để query key và đường xuất khẩu trùng
  // nhau — đọc ở đây, ngoài provider lồng, nên vẫn là store của trang.
  const category = useReportStore((s) => s.category);
  const branch = useReportStore((s) => s.branch);

  // Đổi dòng click ⇒ khoá đổi ⇒ dựng lại state sạch. Nếu không, filter cột và
  // trang hiện tại của lần mở trước sẽ dính sang lần sau.
  const instanceKey = drillDown
    ? `${drillDown.reportType}|${JSON.stringify(drillDown.filters)}`
    : "";

  const reportInitialState = useMemo(
    () =>
      drillDown
        ? buildDrillDownReportState({ category, branch }, drillDown)
        : null,
    [category, branch, drillDown],
  );
  const tableInitialState = useMemo(
    () =>
      drillDown
        ? buildInitialTableState(`${category}-${branch}-drilldown`, {
            columns: [],
          })
        : null,
    [category, branch, drillDown],
  );

  return (
    <AppModal
      open={!!drillDown}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={drillDown?.title ?? ""}
      defaultWidth={1280}
      defaultHeight={720}
      bodyClassName="overflow-hidden"
      // Chân dialog tự render trong body (bên trong provider lồng), nên chân mặc
      // định của AppModal chỉ thêm một nút "Huỷ" thừa.
      showFooter={false}
    >
      {drillDown && reportInitialState && tableInitialState ? (
        <ReportStoreProvider key={instanceKey} initialState={reportInitialState}>
          <TableStoreProvider key={instanceKey} initialState={tableInitialState}>
            <ReportDrillDownBody drillDown={drillDown} onClose={onClose} />
          </TableStoreProvider>
        </ReportStoreProvider>
      ) : null}
    </AppModal>
  );
}
