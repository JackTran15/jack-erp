import type { CSSProperties } from "react";
import { ColumnFilterModeDropdown } from "../../../../../../components/table/ColumnFilterModeControl";
import type { ColumnFilterMode } from "../../../../../../components/table/pagination.dto";
import type { ReportColumnConfig } from "../../../../../../constants/reports/report.interface";

interface Props {
  col: ReportColumnConfig;
  style?: CSSProperties;
  pinned: boolean;
  value: string;
  operator: ColumnFilterMode;
  onOperatorChange: (mode: ColumnFilterMode) => void;
  onValueChange: (value: string) => void;
}

const cellBorder = "border-b border-r border-border";

// Ô filter trong header (tầng 3): chip chọn toán tử (giống table v1) + ô nhập giá trị.
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
  return (
    <td
      style={style}
      className={[`${cellBorder} px-1.5 py-1 bg-background`, pinned ? "z-20" : ""].join(" ")}
    >
      <div className="flex h-6 items-stretch overflow-hidden rounded-[2px] border border-border bg-background">
        <ColumnFilterModeDropdown
          fieldLabel={label}
          value={operator}
          onChange={onOperatorChange}
          triggerClassName="h-6 w-6 rounded-none border-0 border-r border-border text-xs shadow-none"
        />
        <input
          className="w-full min-w-0 bg-transparent px-1.5 text-xs outline-none"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          aria-label={`Lọc ${label}`}
        />
      </div>
    </td>
  );
}
