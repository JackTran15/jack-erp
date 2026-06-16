import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useReportStore } from "../../../../store/page-stores/report/report.context";

// Mirror report type đang chọn vào URL hash (vd #daily_sales_summary) để chia sẻ
// link + giữ trạng thái khi reload. Một chiều state → URL; chiều URL → state đọc
// lúc mount ở ReportPage.
export function ReportUrlSync() {
  const reportType = useReportStore((s) => s.reportType);
  const navigate = useNavigate();
  const { hash, search } = useLocation();

  useEffect(() => {
    const current = decodeURIComponent(hash.replace(/^#/, ""));
    if (reportType && reportType !== current) {
      // Giữ pathname + search, không thêm history entry.
      navigate({ search, hash: reportType }, { replace: true });
    }
  }, [reportType, hash, search, navigate]);

  return null;
}
