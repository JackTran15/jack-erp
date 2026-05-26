import { formatMoneyInteger, Input } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import { TABLE_NUM_CLASS } from "../../ledger-cash/ledger-cash.constants";
import type {
  CashCountDenominationLine,
  CashCountLinePatch,
} from "./cash-count.types";
import { lineAmount, sumAmount, sumQuantity } from "./cash-count.utils";

interface Params {
  lines: CashCountDenominationLine[];
  readOnly: boolean;
  onChangeLine?: (index: number, patch: CashCountLinePatch) => void;
}

export function useCashCountDenominationColumns({
  lines,
  readOnly,
  onChangeLine,
}: Params) {
  const totals = useMemo(
    () => ({
      rowCount: lines.length,
      quantity: sumQuantity(lines),
      amount: sumAmount(
        lines.map((l) => ({
          ...l,
          amount: lineAmount(l.denomination, l.quantity),
        })),
      ),
    }),
    [lines],
  );

  return useMemo((): TableColumn<CashCountDenominationLine>[] => {
    const lineIndex = (line: CashCountDenominationLine) =>
      lines.findIndex((l) => l.denomination === line.denomination);

    return [
      {
        key: "denomination",
        label: "Mệnh giá",
        width: 140,
        headerClassName: "text-right",
        className: `${TABLE_NUM_CLASS} bg-muted`,
        render: (line) => formatMoneyInteger(line.denomination),
      },
      {
        key: "quantity",
        label: "Số lượng",
        width: 140,
        headerClassName: "text-right",
        className: `${TABLE_NUM_CLASS} !px-1 !py-0`,
        render: (line) => {
          const index = lineIndex(line);
          if (readOnly) {
            return (
              <span className="block px-2 py-1.5">
                {line.quantity.toLocaleString("vi-VN")}
              </span>
            );
          }
          return (
            <Input
              type="text"
              inputMode="numeric"
              className="h-8 w-full rounded-none border-0 bg-transparent px-2 text-right shadow-none focus-visible:ring-0"
              value={line.quantity === 0 ? "" : String(line.quantity)}
              onKeyDown={(e) => {
                if (
                  e.key.length === 1 &&
                  !/[0-9]/.test(e.key) &&
                  !e.ctrlKey &&
                  !e.metaKey
                )
                  e.preventDefault();
              }}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                const quantity = raw === "" ? 0 : parseInt(raw, 10);
                onChangeLine?.(index, { quantity });
              }}
            />
          );
        },
      },
      {
        key: "amount",
        label: "Thành tiền",
        width: 140,
        headerClassName: "text-right",
        className: `${TABLE_NUM_CLASS} bg-muted`,
        render: (line) =>
          formatMoneyInteger(lineAmount(line.denomination, line.quantity)),
      },
      {
        key: "description",
        label: "Diễn giải",
        className: "!px-1 !py-0 min-w-[140px]",
        render: (line) => {
          const index = lineIndex(line);
          if (readOnly) {
            return (
              <span className="block truncate px-2 py-1.5 text-muted-foreground">
                {line.description || "—"}
              </span>
            );
          }
          return (
            <Input
              type="text"
              className="h-8 w-full rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
              value={line.description}
              onChange={(e) =>
                onChangeLine?.(index, { description: e.target.value })
              }
            />
          );
        },
      },
    ];
  }, [lines, readOnly, onChangeLine, totals]);
}
