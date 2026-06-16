import { useLocation, useNavigate } from "react-router-dom";
import {
  STORAGE_REPORT_PATHS,
  type PageKey,
} from "../../../../constants/page-registry.constant";
import {
  REPORT_CATEGORY,
  REPORT_CATEGORY_METADATA,
} from "../../../../constants/reports/report-category.constant";
import { getReportTypeLabel } from "../../../../constants/reports/report-type.constant";
import { STORE_TYPE } from "../../../../constants/store.constant";

// TODO(tạm thời): dropdown switch giữa các báo cáo kho ở store view. Xóa khi
// refactor báo cáo kho sang dynamic store view.
const selectClass =
  "w-full h-9 rounded-[4px] border border-[#CCCCCC] bg-white px-3 text-[13px] text-[#333333] outline-none focus:border-[#3B6FE5]";

export function StorageReportSelect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const listReport =
    REPORT_CATEGORY_METADATA[REPORT_CATEGORY.INVENTORY]?.configs?.[
      STORE_TYPE.SINGLE
    ]?.listReport ?? [];

  // Suy loại báo cáo hiện tại từ pathname (đảo STORAGE_REPORT_PATHS).
  const currentType =
    (Object.keys(STORAGE_REPORT_PATHS) as PageKey[]).find(
      (type) => STORAGE_REPORT_PATHS[type] === pathname,
    ) ?? "";

  const handleChange = (type: string) => {
    const path = STORAGE_REPORT_PATHS[type as PageKey];
    if (path) navigate(path);
  };

  return (
    <select
      className={selectClass}
      value={currentType}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="Báo cáo"
    >
      {listReport.map((type) => (
        <option key={type} value={type}>
          {getReportTypeLabel(type)}
        </option>
      ))}
    </select>
  );
}
