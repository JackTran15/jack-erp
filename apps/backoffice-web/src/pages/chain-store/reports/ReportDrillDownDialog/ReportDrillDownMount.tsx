import { useReportStore } from "../../../../store/page-stores/report/report.context";
import { ReportDrillDownDialog } from "./ReportDrillDownDialog";

/**
 * Nối `drillDown` của store trang vào dialog. Tách khỏi `ReportDrillDownDialog`
 * để dialog nhận descriptor qua props và không tự đọc store nào của cha ngoài
 * `category`/`branch` — nhờ đó cái provider lồng bên trong nó không bị nhầm lẫn
 * với store của trang khi đọc code.
 */
export function ReportDrillDownMount() {
  const drillDown = useReportStore((s) => s.drillDown);
  const setDrillDown = useReportStore((s) => s.actions.setDrillDown);

  return (
    <ReportDrillDownDialog
      drillDown={drillDown}
      onClose={() => setDrillDown(null)}
    />
  );
}
