import { useEffect } from "react";
import { ReportFilterOptionType } from "@erp/shared-interfaces";
import { REPORT_FILTERS_LINE } from "../../../../../../../../constants/reports/report-filters.constant";
import { useBranchStore } from "../../../../../../../../store/common/branch/branch.store";
import { useReportStore } from "../../../../../../../../store/page-stores/report/report.context";
import { useReportFilterOptions } from "../../../../../_api/report-filter-options.api";
import { ReportSelectField } from "../ReportSelectField/ReportSelectField";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Dropdown "Kho" phụ thuộc cửa hàng đang hiệu lực:
 * - CHAIN + "Theo nhóm cửa hàng": chỉ kho của các cửa hàng đã chọn.
 * - CHAIN + "Tất cả" / SINGLE: backend tự giới hạn theo chi nhánh user quản lý
 *   (SINGLE gửi đúng chi nhánh header).
 */
export function WarehouseSelectField({ value, onChange }: Props) {
  const isChain = useBranchStore((s) => s.isChain);
  const headerBranchId = useBranchStore((s) => s.branchId);
  const store = useReportStore((s) => s.filters[REPORT_FILTERS_LINE.STORE]);

  const branchIds = isChain
    ? store?.scope === "group" && store.storeIds.length
      ? store.storeIds
      : undefined
    : headerBranchId
      ? [headerBranchId]
      : undefined;

  const { data: options = [] } = useReportFilterOptions(
    ReportFilterOptionType.WAREHOUSE,
    undefined,
    { branchIds },
  );

  // Kho đã chọn không còn trong tập mới (đổi cửa hàng/chi nhánh) → về "Tất cả kho".
  useEffect(() => {
    if (value && options.length && !options.some((o) => String(o.value) === value)) {
      onChange("");
    }
  }, [value, options, onChange]);

  return (
    <ReportSelectField
      value={value}
      options={options.map((o) => ({ value: String(o.value), label: o.label }))}
      placeholder="Tất cả kho"
      onChange={onChange}
    />
  );
}
