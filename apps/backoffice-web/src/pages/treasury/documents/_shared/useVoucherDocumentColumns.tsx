import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import {
  LEDGER_CASH_VI_DATE,
  TABLE_NUM_CLASS,
} from "../../ledger-cash/ledger-cash.constants";
import type { LedgerCashVoucherDocumentLine } from "../../ledger-cash/ledger-cash.types";
import { VoucherLink } from "./VoucherLink";

/**
 * Columns for a voucher's "Chứng từ" tab — the invoices/debts the voucher
 * settles, with a totals footer. Shared by the cash and deposit receipt/payment
 * dialogs, which show the same grid over the same row shape.
 */
export function useVoucherDocumentColumns(
  documentLines: LedgerCashVoucherDocumentLine[],
  onOpenInvoice?: (code: string) => void,
) {
  const totals = useMemo(
    () =>
      documentLines.reduce(
        (acc, row) => ({
          debtAmount: acc.debtAmount + row.debtAmount,
          collectedAmount: acc.collectedAmount + row.collectedAmount,
          remainingAmount: acc.remainingAmount + row.remainingAmount,
          collectAmount: acc.collectAmount + row.collectAmount,
        }),
        {
          debtAmount: 0,
          collectedAmount: 0,
          remainingAmount: 0,
          collectAmount: 0,
        },
      ),
    [documentLines],
  );

  const columns: TableColumn<LedgerCashVoucherDocumentLine>[] = useMemo(
    () => [
      {
        key: "documentDate",
        label: "Ngày chứng từ",
        width: 110,
        render: (r) =>
          r.documentDate.toLocaleDateString("vi-VN", LEDGER_CASH_VI_DATE),
      },
      {
        key: "documentNo",
        label: "Số chứng từ",
        width: 130,
        render: (r) => (
          <VoucherLink
            code={r.documentNo}
            clickable={!!onOpenInvoice}
            onClick={() => onOpenInvoice?.(r.documentNo)}
          />
        ),
      },
      {
        key: "debtAmount",
        label: "Số nợ",
        width: 120,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.debtAmount),
      },
      {
        key: "collectedAmount",
        label: "Số đã thu",
        width: 110,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.collectedAmount),
      },
      {
        key: "remainingAmount",
        label: "Số còn phải thu",
        width: 130,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.remainingAmount),
      },
      {
        key: "collectAmount",
        label: "Số thu",
        width: 110,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.collectAmount),
      },
    ],
    [onOpenInvoice],
  );

  const columnsWithFooter = useMemo(() => {
    const footerByKey: Record<string, number> = {
      debtAmount: totals.debtAmount,
      collectedAmount: totals.collectedAmount,
      remainingAmount: totals.remainingAmount,
      collectAmount: totals.collectAmount,
    };
    return columns.map((col) => {
      if (col.key === "documentDate") {
        return { ...col, footer: <span className="font-semibold">Tổng</span> };
      }
      const total = footerByKey[col.key];
      if (total === undefined) return col;
      return {
        ...col,
        footer: (
          <span className="font-semibold">{formatMoneyInteger(total)}</span>
        ),
      };
    });
  }, [columns, totals]);

  return { documentColumnsWithFooter: columnsWithFooter };
}
