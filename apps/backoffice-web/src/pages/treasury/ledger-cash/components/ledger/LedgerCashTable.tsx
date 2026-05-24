import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import { BaseDataTable } from "../../../../../components/table/BaseDataTable";
import type { LedgerCashRow } from "../../ledger-cash.types";
import { useLedgerCashTableColumns } from "./useLedgerCashTableColumns";

interface Props {
  rows: LedgerCashRow[];
  transactionRows: LedgerCashRow[];
  onDrillDown: (row: LedgerCashRow) => void;
}

export function LedgerCashTable({
  rows,
  transactionRows,
  onDrillDown,
}: Props) {
  const columns = useLedgerCashTableColumns(onDrillDown);

  const summaryMap = useMemo(() => {
    const totalIn = transactionRows.reduce((s, r) => s + r.amountIn, 0);
    const totalOut = transactionRows.reduce((s, r) => s + r.amountOut, 0);
    return {
      description: <span className="font-semibold">Tổng</span>,
      amountIn: <span>{formatMoneyInteger(totalIn)}</span>,
      amountOut: <span>{formatMoneyInteger(totalOut)}</span>,
    };
  }, [transactionRows]);

  const effectiveColumns = useMemo(
    () =>
      columns.map((c) => ({
        ...c,
        footer: summaryMap[c.key as keyof typeof summaryMap] ?? null,
      })),
    [columns, summaryMap],
  );

  return (
    <BaseDataTable
      className="min-h-0 flex-1"
      scrollContainerClassName="min-h-[280px] flex-1"
      columns={effectiveColumns}
      rows={rows}
      loading={false}
      emptyLabel="Không có phát sinh trong kỳ."
      getRowKey={(r) => r.id}
    />
  );
}
