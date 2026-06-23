import { MultiSelectChips } from "@erp/ui";
import { reportStores } from "../../../_mock/report-stores.mock";
import type { StoreScopeValue } from "../../../../../../../../store/page-stores/report/report.interface";

interface Props {
  value: StoreScopeValue;
  onChange: (value: StoreScopeValue) => void;
}

const STORE_OPTIONS = reportStores.map((s) => ({
  value: s.id,
  label: `${s.code} - ${s.name}`,
}));

export function StoreScopeField({ value, onChange }: Props) {
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
