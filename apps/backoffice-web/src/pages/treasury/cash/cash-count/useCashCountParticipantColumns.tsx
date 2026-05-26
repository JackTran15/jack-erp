import { Input, type LineColumn } from "@erp/ui";
import { useMemo } from "react";
import type { CashCountParticipant } from "./cash-count.types";

export function useCashCountParticipantColumns(
  readOnly: boolean,
  onChange: (index: number, patch: Partial<CashCountParticipant>) => void,
) {
  return useMemo(
    (): LineColumn<CashCountParticipant>[] => [
      {
        key: "fullName",
        label: "Họ tên",
        width: 220,
        placeholder: "Nhập vào họ tên",
        renderEditor: (row, idx) =>
          readOnly ? (
            <span className="px-2">{row.fullName || "—"}</span>
          ) : (
            <Input
              type="text"
              className="h-full w-full rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
              value={row.fullName}
              onChange={(e) => onChange(idx, { fullName: e.target.value })}
            />
          ),
      },
      {
        key: "title",
        label: "Chức danh",
        width: 160,
        renderEditor: (row, idx) =>
          readOnly ? (
            <span className="px-2">{row.title || "—"}</span>
          ) : (
            <Input
              type="text"
              className="h-full w-full rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
              value={row.title}
              onChange={(e) => onChange(idx, { title: e.target.value })}
            />
          ),
      },
      {
        key: "representative",
        label: "Đại diện",
        width: 180,
        renderEditor: (row, idx) =>
          readOnly ? (
            <span className="px-2">{row.representative || "—"}</span>
          ) : (
            <Input
              type="text"
              className="h-full w-full rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
              value={row.representative}
              onChange={(e) =>
                onChange(idx, { representative: e.target.value })
              }
            />
          ),
      },
    ],
    [readOnly, onChange],
  );
}
