import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import { VoucherLink } from "../../documents";
import {
  LEDGER_CASH_VI_DATE,
  TABLE_NUM_CLASS,
} from "../../ledger-cash/ledger-cash.constants";
import { RECEIPT_CASH_DOCUMENT_TYPE_FILTER_OPTIONS } from "./receipt-cash.constants";
import type { ReceiptCashListRow } from "./receipt-cash.types";

export function useReceiptCashTableColumns(
  onOpenVoucher: (row: ReceiptCashListRow) => void,
) {
  return useMemo(
    (): TableColumn<ReceiptCashListRow>[] => [
      {
        key: "documentDate",
        label: "Ngày",
        width: 110,
        render: (r) =>
          r.documentDate.toLocaleDateString("vi-VN", LEDGER_CASH_VI_DATE),
      },
      {
        key: "voucherNo",
        label: "Số chứng từ",
        width: 130,
        render: (r) => (
          <VoucherLink
            code={r.voucherNo}
            clickable
            onClick={() => onOpenVoucher(r)}
          />
        ),
      },
      {
        key: "documentTypeLabel",
        label: "Loại chứng từ",
        width: 200,
        filterKind: "select",
        filterOptions: RECEIPT_CASH_DOCUMENT_TYPE_FILTER_OPTIONS.map((o) => ({
          value: o.label,
          label: o.label,
        })),
        render: (r) => r.documentTypeLabel,
      },
      {
        key: "totalAmount",
        label: "Tổng tiền",
        width: 130,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.totalAmount),
      },
      {
        key: "counterparty",
        label: "Đối tượng nộp/nhận",
        width: 160,
        render: (r) => r.counterparty,
      },
      {
        key: "reason",
        label: "Lý do",
        width: 240,
        render: (r) => r.description,
      },
    ],
    [onOpenVoucher],
  );
}
