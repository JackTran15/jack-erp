import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../../components/table/BaseDataTable";
import {
  LEDGER_CASH_VI_DATE,
  TABLE_NUM_CLASS,
} from "../../ledger-cash.constants";
import type {
  LedgerCashVoucherDetail,
  LedgerCashVoucherDocumentLine,
  LedgerCashVoucherLine,
} from "../../ledger-cash.types";

export function useReceiptVoucherDetailColumns(
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
        label: "Mục thu",
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

  const documentLines = detail?.documentLines ?? [];

  const documentTotals = useMemo(
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

  const documentColumns: TableColumn<LedgerCashVoucherDocumentLine>[] = useMemo(
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
          <span className="font-medium text-primary">{r.documentNo}</span>
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
    [],
  );

  const documentColumnsWithFooter = useMemo(
    () =>
      documentColumns.map((col) => {
        if (col.key === "documentDate") {
          return { ...col, footer: <span className="font-semibold">Tổng</span> };
        }
        if (col.key === "debtAmount") {
          return {
            ...col,
            footer: (
              <span className="font-semibold">
                {formatMoneyInteger(documentTotals.debtAmount)}
              </span>
            ),
          };
        }
        if (col.key === "collectedAmount") {
          return {
            ...col,
            footer: (
              <span className="font-semibold">
                {formatMoneyInteger(documentTotals.collectedAmount)}
              </span>
            ),
          };
        }
        if (col.key === "remainingAmount") {
          return {
            ...col,
            footer: (
              <span className="font-semibold">
                {formatMoneyInteger(documentTotals.remainingAmount)}
              </span>
            ),
          };
        }
        if (col.key === "collectAmount") {
          return {
            ...col,
            footer: (
              <span className="font-semibold">
                {formatMoneyInteger(documentTotals.collectAmount)}
              </span>
            ),
          };
        }
        return col;
      }),
    [documentColumns, documentTotals],
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

  return {
    lineColumnsWithFooter,
    documentColumnsWithFooter,
    documentLines,
  };
}
