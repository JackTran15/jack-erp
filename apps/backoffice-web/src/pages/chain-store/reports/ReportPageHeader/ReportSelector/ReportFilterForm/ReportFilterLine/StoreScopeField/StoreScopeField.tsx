import { ReportFilterOptionType } from "@erp/shared-interfaces";
import { MultiSelectChips } from "@erp/ui";
import { useReportFilterOptions } from "../../../../../_api/report-filter-options.api";
import type { StoreScopeValue } from "../../../../../../../../store/page-stores/report/report.interface";

interface Props {
  value: StoreScopeValue;
  onChange: (value: StoreScopeValue) => void;
}

export function StoreScopeField({ value, onChange }: Props) {
  const { data: stores = [] } = useReportFilterOptions(
    ReportFilterOptionType.STORE,
  );
  const STORE_OPTIONS = stores.map((s) => ({
    value: String(s.value),
    label: s.label,
  }));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-6 text-xs text-foreground">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="store-scope"
            checked={value.scope === "all"}
            onChange={() => onChange({ scope: "all", storeIds: [] })}
            className="accent-primary"
          />
          Tất cả
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="store-scope"
            checked={value.scope === "group"}
            onChange={() => onChange({ ...value, scope: "group" })}
            className="accent-primary"
          />
          Theo nhóm cửa hàng
        </label>
      </div>

      {value.scope === "group" ? (
        <MultiSelectChips
          options={STORE_OPTIONS}
          value={value.storeIds}
          onValueChange={(ids) => onChange({ scope: "group", storeIds: ids })}
          placeholder="Chọn cửa hàng…"
        />
      ) : null}
    </div>
  );
}
