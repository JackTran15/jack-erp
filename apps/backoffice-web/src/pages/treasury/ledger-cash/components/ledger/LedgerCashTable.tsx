import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import { BaseDataTable } from "../../../../../components/table/BaseDataTable";
import type { LedgerCashRow } from "../../ledger-cash.types";
import { useLedgerCashTableColumns } from "./useLedgerCashTableColumns";

interface Props {
  rows: LedgerCashRow[];
  transactionRows: LedgerCashRow[];
  onDrillDown: (row: LedgerCashRow) => void;
  loading?: boolean;
  totalDebit?: number;
  totalCredit?: number;
  closingBalance?: number;
  columnFilterControl?: React.ComponentProps<
    typeof BaseDataTable<LedgerCashRow>
  >["columnFilterControl"];
}

export function LedgerCashTable({
  rows,
  transactionRows,
  onDrillDown,
  loading = false,
  totalDebit,
  totalCredit,
  closingBalance,
  columnFilterControl,
}: Props) {
  const columns = useLedgerCashTableColumns(onDrillDown);

  const summaryMap = useMemo(() => {
    const totalIn =
      totalDebit ??
      transactionRows.reduce((s, r) => s + r.amountIn, 0);
    const totalOut =
      totalCredit ??
      transactionRows.reduce((s, r) => s + r.amountOut, 0);
    return {
      description: <span className="font-semibold">Tổng</span>,
      amountIn: <span>{formatMoneyInteger(totalIn)}</span>,
      amountOut: <span>{formatMoneyInteger(totalOut)}</span>,
    };
  }, [transactionRows, totalDebit, totalCredit]);

  const effectiveColumns = useMemo(
    () =>
      columns.map((c) => ({
        ...c,
        footer: summaryMap[c.key as keyof typeof summaryMap] ?? null,
      })),
    [columns, summaryMap],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BaseDataTable
        className="min-h-0 flex-1"
        scrollContainerClassName="min-h-[280px] flex-1"
        columns={effectiveColumns}
        rows={rows}
        loading={loading}
        emptyLabel="Không có phát sinh trong kỳ."
        getRowKey={(r) => r.id}
        columnFilterControl={columnFilterControl}
      />
      {closingBalance != null && (
        <div className="flex items-center justify-end border-t bg-muted/50 px-4 py-2 text-sm font-semibold">
          <span className="mr-4">Số dư cuối kỳ:</span>
          <span>{formatMoneyInteger(closingBalance)}</span>
        </div>
      )}
    </div>
  );
}
