import type { CSSProperties } from "react";
import {
  ColumnCompareOpDropdown,
  ColumnFilterModeDropdown,
} from "../../../../../../components/table/ColumnFilterModeControl";
import {
  DEFAULT_COLUMN_COMPARE_OP,
  DEFAULT_COLUMN_FILTER_MODE,
  type ColumnCompareOp,
  type ColumnFilterMode,
} from "../../../../../../components/table/pagination.dto";
import type { ReportColumnConfig } from "../../../../../../constants/reports/report.interface";
import { resolveReportColumnFilterKind } from "../../../../../../lib/table/report-table";

interface Props {
  col: ReportColumnConfig;
  style?: CSSProperties;
  pinned: boolean;
  value: string;
  operator: string;
  onOperatorChange: (op: string) => void;
  onValueChange: (value: string) => void;
}

const cellBorder = "border-b border-r border-border";
const triggerClass = "h-8 w-7 rounded-none border-0 border-r border-border text-xs shadow-none";
const inputClass = "w-full min-w-0 bg-transparent px-2 text-xs outline-none";

// Ô filter trong header (tầng 3): control thay đổi theo kiểu cột (text/number/date/time/select).
export function FilterHeaderCell({
  col,
  style,
  pinned,
  value,
  operator,
  onOperatorChange,
  onValueChange,
}: Props) {
  const label = col.label ?? col.column;
  const kind = resolveReportColumnFilterKind(col);

  const cellClass = [`${cellBorder} px-1.5 py-0.5 bg-background`, pinned ? "z-20" : ""].join(" ");
  const boxClass =
    "flex h-8 items-stretch overflow-hidden rounded-[2px] border border-border bg-background";

  if (kind === "none") {
    return <td style={style} className={cellClass} />;
  }

  if (kind === "select") {
    return (
      <td style={style} className={cellClass}>
        <div className={boxClass}>
          <select
            className={`${inputClass} cursor-pointer`}
            value={value}
            onChange={(e) => {
              onOperatorChange("equals");
              onValueChange(e.target.value);
            }}
            aria-label={`Lọc ${label}`}
          >
            <option value="">— Tất cả —</option>
            {(col.tableConfig?.filterOptions ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </td>
    );
  }

  if (kind === "text") {
    return (
      <td style={style} className={cellClass}>
        <div className={boxClass}>
          <ColumnFilterModeDropdown
            fieldLabel={label}
            value={(operator as ColumnFilterMode) || DEFAULT_COLUMN_FILTER_MODE}
            onChange={onOperatorChange}
            triggerClassName={triggerClass}
          />
          <input
            className={inputClass}
            value={value}
            onChange={(e) => {
              // Toán tử mặc định chỉ hiển thị (fallback) -> chốt vào state khi nhập
              // để buildColumnFilters serialize đúng (nếu không sẽ bị bỏ qua).
              if (!operator) onOperatorChange(DEFAULT_COLUMN_FILTER_MODE);
              onValueChange(e.target.value);
            }}
            aria-label={`Lọc ${label}`}
          />
        </div>
      </td>
    );
  }

  // number | date | time: chip toán tử so sánh (=, <, ≤, >, ≥) + input theo kiểu.
  const inputType = kind === "number" ? "number" : kind; // "date" | "time" | "number"
  return (
    <td style={style} className={cellClass}>
      <div className={boxClass}>
        <ColumnCompareOpDropdown
          fieldLabel={label}
          value={(operator as ColumnCompareOp) || DEFAULT_COLUMN_COMPARE_OP}
          onChange={onOperatorChange}
          triggerClassName={triggerClass}
        />
        <input
          type={inputType}
          inputMode={kind === "number" ? "decimal" : undefined}
          className={[
            inputClass,
            kind === "number" ? "no-spinner" : "",
            (kind === "date" || kind === "time") && !value
              ? "date-input-blank-empty"
              : "",
          ].join(" ")}
          value={value}
          onChange={(e) => {
            // Toán tử so sánh mặc định ("=") chỉ là fallback hiển thị -> chốt vào
            // state khi nhập để date/number filter không bị bỏ qua lúc serialize.
            if (!operator) onOperatorChange(DEFAULT_COLUMN_COMPARE_OP);
            onValueChange(e.target.value);
          }}
          aria-label={`Lọc ${label}`}
        />
      </div>
    </td>
  );
}
