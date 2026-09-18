import { REPORT_FILTERS_LINE } from "../../../../../constants/reports/report-filters.constant";
import {
  getReportBackendSource,
  getReportFormLines,
  getReportTypeLabel,
} from "../../../../../constants/reports/report-type.constant";
import { STORE_TYPE } from "../../../../../constants/store.constant";
import { useReportStore } from "../../../../../store/page-stores/report/report.context";
import type { ReportFilterValues } from "../../../../../store/page-stores/report/report.interface";
import { useReportFilterOptions } from "../../_api/report-filter-options.api";
import {
  buildEmployeeSubtitle,
  buildStoreSubtitle,
} from "../../_lib/report-filter-subtitle";

export function ReportPageHeaderTitle() {
  const reportType = useReportStore((s) => s.reportType);
  const branch = useReportStore((s) => s.branch);
  const title = getReportTypeLabel(reportType);
  const description =
    branch === STORE_TYPE.CHAIN ? "Xem theo chuỗi cửa hàng" : "Xem theo chi nhánh";

  // Quỹ tiền có dòng Cửa hàng / Nhân viên: phụ đề dựng từ bộ lọc đã áp dụng
  // (MShopKeeper). Các domain khác cũng khai báo dòng STORE nhưng giữ chữ cố
  // định — gate theo domain + dòng; báo cáo quỹ tiền không có hai dòng đó
  // (Tình hình thu chi) cũng giữ chữ cố định.
  const lines = getReportFormLines(reportType, branch);
  const hasFilterSubtitle =
    getReportBackendSource(reportType) === "cash" &&
    (lines.includes(REPORT_FILTERS_LINE.STORE) ||
      lines.includes(REPORT_FILTERS_LINE.EMPLOYEE));

  return (
    <div className="mx-auto flex flex-col items-center gap-1 text-center text-primary">
      <h1 className="text-lg font-semibold uppercase tracking-wide leading-tight">
        {title}
      </h1>
      {hasFilterSubtitle ? (
        <CashFundFilterSubtitle lines={lines} />
      ) : (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

interface CashFundFilterSubtitleProps {
  lines: readonly REPORT_FILTERS_LINE[];
}

// Mỗi dòng là một component riêng để hook options chỉ chạy khi registry khai báo
// dòng đó (chế độ chi nhánh không có STORE → không gọi options cửa hàng).
function CashFundFilterSubtitle({ lines }: CashFundFilterSubtitleProps) {
  // Bộ lọc ĐÃ áp dụng (Đồng ý / Lấy dữ liệu) — chưa áp dụng thì mọi dòng là "Tất cả".
  const filters = useReportStore((s) => s.appliedRequest?.filters) ?? {};
  return (
    <>
      {lines.includes(REPORT_FILTERS_LINE.STORE) ? (
        <StoreSubtitleLine store={filters[REPORT_FILTERS_LINE.STORE]} />
      ) : null}
      {lines.includes(REPORT_FILTERS_LINE.EMPLOYEE) ? (
        <EmployeeSubtitleLine employeeId={filters[REPORT_FILTERS_LINE.EMPLOYEE]} />
      ) : null}
    </>
  );
}

interface StoreSubtitleLineProps {
  store: ReportFilterValues[REPORT_FILTERS_LINE.STORE] | undefined;
}

function StoreSubtitleLine({ store }: StoreSubtitleLineProps) {
  const { data: storeOptions } = useReportFilterOptions("store");
  return (
    <p className="text-xs text-muted-foreground">
      {buildStoreSubtitle(store, storeOptions)}
    </p>
  );
}

interface EmployeeSubtitleLineProps {
  employeeId: string | undefined;
}

function EmployeeSubtitleLine({ employeeId }: EmployeeSubtitleLineProps) {
  const { data: employeeOptions } = useReportFilterOptions("employee");
  return (
    <p className="text-xs text-muted-foreground">
      {buildEmployeeSubtitle(employeeId, employeeOptions)}
    </p>
  );
}
