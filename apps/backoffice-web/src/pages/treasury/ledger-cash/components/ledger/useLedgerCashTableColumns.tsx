import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../../components/table/BaseDataTable";
import { LEDGER_CASH_VI_DATE, TABLE_NUM_CLASS } from "../../ledger-cash.constants";
import {
  isOpeningBalanceRow,
  resolveLedgerCashDrillDown,
  type LedgerCashRow,
} from "../../ledger-cash.types";
import { VoucherLink } from "../../../documents";

export function useLedgerCashTableColumns(
  openDrillDown: (row: LedgerCashRow) => void,
) {
  return useMemo(
    (): TableColumn<LedgerCashRow>[] => [
      {
        key: "documentDate",
        label: "Ngày chứng từ",
        width: 110,
        filterKind: "none",
        render: (r) =>
          isOpeningBalanceRow(r)
            ? ""
            : r.documentDate.toLocaleDateString("vi-VN", LEDGER_CASH_VI_DATE),
      },
      {
        key: "receiptNo",
        label: "Số phiếu thu",
        width: 120,
        filterKind: "none",
        render: (r) => (
          <VoucherLink
            code={r.receiptNo}
            clickable={
              !!r.receiptNo &&
              !isOpeningBalanceRow(r) &&
              resolveLedgerCashDrillDown(r) != null
            }
            onClick={() => openDrillDown(r)}
          />
        ),
      },
      {
        key: "paymentNo",
        label: "Số phiếu chi",
        width: 120,
        filterKind: "none",
        render: (r) => (
          <VoucherLink
            code={r.paymentNo}
            clickable={
              !!r.paymentNo &&
              !isOpeningBalanceRow(r) &&
              resolveLedgerCashDrillDown(r) != null
            }
            onClick={() => openDrillDown(r)}
          />
        ),
      },
      {
        key: "description",
        label: "Diễn giải",
        width: 200,
        render: (r) => (
          <span
            className={isOpeningBalanceRow(r) ? "font-semibold" : undefined}
          >
            {r.description}
          </span>
        ),
      },
      {
        key: "amountIn",
        label: "Số tiền thu",
        width: 120,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => (r.amountIn > 0 ? formatMoneyInteger(r.amountIn) : ""),
      },
      {
        key: "amountOut",
        label: "Số tiền chi",
        width: 120,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => (r.amountOut > 0 ? formatMoneyInteger(r.amountOut) : ""),
      },
      {
        key: "balance",
        label: "Số tiền còn lại",
        width: 130,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.balance),
      },
      {
        key: "counterparty",
        label: "Đối tượng nộp/nhận",
        width: 140,
        render: (r) => r.counterparty,
      },
      {
        key: "employee",
        label: "Đối tượng thu/chi",
        width: 140,
        render: (r) => r.employee,
      },
    ],
    [openDrillDown],
  );
}
