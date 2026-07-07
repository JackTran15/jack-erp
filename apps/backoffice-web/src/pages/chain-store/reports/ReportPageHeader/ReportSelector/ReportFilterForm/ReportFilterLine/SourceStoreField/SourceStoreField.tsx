import { useEffect } from "react";
import { ReportFilterOptionType } from "@erp/shared-interfaces";
import { useBranchStore } from "../../../../../../../../store/common/branch/branch.store";
import { useReportFilterOptions } from "../../../../../_api/report-filter-options.api";
import { ReportSelectField } from "../ReportSelectField/ReportSelectField";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * "Cửa hàng xuất" (báo cáo điều chuyển theo cửa hàng):
 * - CHAIN: chọn được trong các cửa hàng user quản lý; default = cửa hàng đầu tiên.
 * - SINGLE: cố định = chi nhánh đang chọn ở header, disabled.
 */
export function SourceStoreField({ value, onChange }: Props) {
  const isChain = useBranchStore((s) => s.isChain);
  const headerBranchId = useBranchStore((s) => s.branchId);
  const { data: stores = [] } = useReportFilterOptions(
    ReportFilterOptionType.STORE,
  );
  const options = stores.map((s) => ({
    value: String(s.value),
    label: s.label,
  }));

  const defaultId = isChain
    ? (options[0]?.value ?? "")
    : (headerBranchId ?? "");

  useEffect(() => {
    if (defaultId && value !== defaultId && (!isChain || !value)) {
      // SINGLE: luôn bám theo header branch; CHAIN: chỉ fill khi chưa chọn.
      onChange(defaultId);
    }
  }, [defaultId, isChain, value, onChange]);

  return (
    <ReportSelectField
      value={value || defaultId}
      options={options}
      hidePlaceholder
      disabled={!isChain}
      onChange={onChange}
    />
  );
}
