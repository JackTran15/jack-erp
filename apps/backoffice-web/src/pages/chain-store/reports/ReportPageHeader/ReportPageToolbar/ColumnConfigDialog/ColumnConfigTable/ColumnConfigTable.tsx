import { Minus, Plus } from "lucide-react";
import { ColumnConfigCheckbox } from "../ColumnConfigCheckbox/ColumnConfigCheckbox";

export type TriState = "checked" | "unchecked" | "indeterminate";

export interface GroupDisplayRow {
  kind: "group";
  label: string;
  expanded: boolean;
  visibility: TriState;
  pinned: TriState;
  selected: boolean;
}

export interface ColumnDisplayRow {
  kind: "column";
  id: string;
  indented: boolean;
  dataLabel: string;
  displayLabel: string;
  visible: boolean;
  pinned: boolean;
  selected: boolean;
}

export type ColumnConfigRow = GroupDisplayRow | ColumnDisplayRow;

interface Props {
  rows: ColumnConfigRow[];
  headerVisibility: TriState;
  headerPinned: TriState;
  onToggleHeaderVisibility: () => void;
  onToggleHeaderPinned: () => void;
  onSelectRow: (row: ColumnConfigRow) => void;
  onToggleExpand: (label: string) => void;
  onToggleVisibility: (row: ColumnConfigRow) => void;
  onTogglePinned: (row: ColumnConfigRow) => void;
}

const headerCellClass = "border border-[#E0E0E0] px-3 py-2 text-[13px] font-bold text-[#1F2430]";

export function ColumnConfigTable({
  rows,
  headerVisibility,
  headerPinned,
  onToggleHeaderVisibility,
  onToggleHeaderPinned,
  onSelectRow,
  onToggleExpand,
  onToggleVisibility,
  onTogglePinned,
}: Props) {
  return (
    <table className="w-full border-collapse">
      <colgroup>
        <col style={{ width: "46%" }} />
        <col style={{ width: "38%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "8%" }} />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-[#F5F5F5]">
        <tr>
          <th className={`${headerCellClass} text-left`}>Tên cột dữ liệu</th>
          <th className={`${headerCellClass} text-left`}>Tên cột hiển thị</th>
          <th className={headerCellClass}>
            <div className="flex flex-col items-center gap-1">
              <span>Hiển thị</span>
              <ColumnConfigCheckbox
                checked={headerVisibility === "checked"}
                indeterminate={headerVisibility === "indeterminate"}
                onChange={onToggleHeaderVisibility}
                ariaLabel="Chọn tất cả hiển thị"
              />
            </div>
          </th>
          <th className={headerCellClass}>
            <div className="flex flex-col items-center gap-1">
              <span>Cố định cột</span>
              <ColumnConfigCheckbox
                checked={headerPinned === "checked"}
                indeterminate={headerPinned === "indeterminate"}
                onChange={onToggleHeaderPinned}
                ariaLabel="Chọn tất cả cố định cột"
              />
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = row.kind === "group" ? `group:${row.label}` : `col:${row.id}`;
          const rowBg = row.selected ? "bg-[#E4E7F4]" : "bg-white hover:bg-[#F5F6FA]";
          const visible = row.kind === "group" ? row.visibility : row.visible ? "checked" : "unchecked";
          const pinned = row.kind === "group" ? row.pinned : row.pinned ? "checked" : "unchecked";
          return (
            <tr
              key={key}
              className={`cursor-pointer ${rowBg}`}
              onClick={() => onSelectRow(row)}
            >
              <td className="border border-[#E0E0E0] px-3 py-2 text-[13px]">
                <div
                  className="flex items-center gap-2"
                  style={{ paddingLeft: row.kind === "column" && row.indented ? 28 : 0 }}
                >
                  {row.kind === "group" ? (
                    <button
                      type="button"
                      aria-label={row.expanded ? "Thu gọn" : "Mở rộng"}
                      className="text-[#757575]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand(row.label);
                      }}
                    >
                      {row.expanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </button>
                  ) : null}
                  <span
                    className={
                      row.kind === "group" ? "font-bold text-[#1F2430]" : "text-[#3C4250]"
                    }
                  >
                    {row.kind === "group" ? row.label : row.dataLabel}
                  </span>
                </div>
              </td>
              <td className="border border-[#E0E0E0] px-3 py-2 text-[13px] text-[#3C4250]">
                {row.kind === "column" ? row.displayLabel : ""}
              </td>
              <td className="border border-[#E0E0E0] px-3 py-2">
                <div className="flex justify-center">
                  <ColumnConfigCheckbox
                    checked={visible === "checked"}
                    indeterminate={visible === "indeterminate"}
                    onChange={() => onToggleVisibility(row)}
                    ariaLabel="Hiển thị cột"
                  />
                </div>
              </td>
              <td className="border border-[#E0E0E0] px-3 py-2">
                <div className="flex justify-center">
                  <ColumnConfigCheckbox
                    checked={pinned === "checked"}
                    indeterminate={pinned === "indeterminate"}
                    onChange={() => onTogglePinned(row)}
                    ariaLabel="Cố định cột"
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
