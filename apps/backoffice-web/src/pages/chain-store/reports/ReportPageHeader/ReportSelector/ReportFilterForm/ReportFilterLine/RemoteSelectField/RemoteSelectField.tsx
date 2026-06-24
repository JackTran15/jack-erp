import { type ReportFilterOptionType } from "@erp/shared-interfaces";
import { useReportFilterOptions } from "../../../../../_api/report-filter-options.api";
import { ReportSelectField } from "../ReportSelectField/ReportSelectField";

interface Props {
  type: ReportFilterOptionType;
  value: string;
  placeholder?: string;
  hidePlaceholder?: boolean;
  onChange: (value: string) => void;
}

// Dropdown filter đổ options từ API options dùng chung (theo `type`).
export function RemoteSelectField({
  type,
  value,
  placeholder,
  hidePlaceholder,
  onChange,
}: Props) {
  const { data: options = [] } = useReportFilterOptions(type);
  return (
    <ReportSelectField
      value={value}
      options={options.map((o) => ({ value: String(o.value), label: o.label }))}
      placeholder={placeholder}
      hidePlaceholder={hidePlaceholder}
      onChange={onChange}
    />
  );
}
