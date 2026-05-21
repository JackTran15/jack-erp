import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../../components/table/BaseDataTable";
import { TABLE_NUM_CLASS } from "../../ledger-cash.constants";
import type {
  LedgerCashVoucherDetail,
  LedgerCashVoucherLine,
} from "../../ledger-cash.types";

export function useSimplePaymentVoucherLineColumns(
  detail: LedgerCashVoucherDetail | null,
) {
  const lineColumns: TableColumn<LedgerCashVoucherLine>[] = useMemo(
    () => [
      {
        key: "description",
        label: "Diễn giải",
        width: 280,
        render: (r) => r.description,
      },
      {
        key: "amount",
        label: "Số tiền",
        width: 140,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.amount),
      },
      {
        key: "category",
        label: "Mục chi",
        width: 160,
        render: (r) => r.category,
      },
    ],
    [],
  );

  const lineTotal = useMemo(
    () => (detail?.lines ?? []).reduce((s, l) => s + l.amount, 0),
    [detail?.lines],
  );

  const lineColumnsWithFooter = useMemo(
    () =>
      lineColumns.map((c) =>
        c.key === "amount"
          ? {
              ...c,
              footer: (
                <span className="font-semibold">
                  {formatMoneyInteger(lineTotal)}
                </span>
              ),
            }
          : c.key === "description"
            ? { ...c, footer: <span className="font-semibold">Tổng</span> }
            : c,
      ),
    [lineColumns, lineTotal],
  );

  return { lineColumnsWithFooter };
}
