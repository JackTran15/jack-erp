import { type ReportFilterOptionType } from "@erp/shared-interfaces";
import { useReportFilterOptions } from "../../../../../_api/report-filter-options.api";
import { ReportSelectField } from "../ReportSelectField/ReportSelectField";

interface Props {
  type: ReportFilterOptionType;
  value: string;
  placeholder?: string;
  hidePlaceholder?: boolean;
  /** Hide these values from the option list (e.g. exclude the already-selected "Cửa hàng xuất" from "Cửa hàng nhận"). */
  excludeValues?: string[];
  onChange: (value: string) => void;
}

// Dropdown filter đổ options từ API options dùng chung (theo `type`).
export function RemoteSelectField({
  type,
  value,
  placeholder,
  hidePlaceholder,
  excludeValues,
  onChange,
}: Props) {
  const { data: options = [] } = useReportFilterOptions(type);
  const visibleOptions = excludeValues?.length
    ? options.filter((o) => !excludeValues.includes(String(o.value)))
    : options;
  return (
    <ReportSelectField
      value={value}
      options={visibleOptions.map((o) => ({ value: String(o.value), label: o.label }))}
      placeholder={placeholder}
      hidePlaceholder={hidePlaceholder}
      onChange={onChange}
    />
  );
}
