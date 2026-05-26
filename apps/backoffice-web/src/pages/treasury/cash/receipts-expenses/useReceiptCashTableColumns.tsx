import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import { VoucherLink } from "../../documents";
import {
  LEDGER_CASH_VI_DATE,
  TABLE_NUM_CLASS,
} from "../../ledger-cash/ledger-cash.constants";
import { receiptPaymentDocumentTypeLabel } from "../../cash-vouchers.labels";
import type { ReceiptPaymentListItem } from "../../cash-vouchers.types";
import { RECEIPT_CASH_DOCUMENT_TYPE_FILTER_OPTIONS } from "./receipt-cash.constants";

export function useReceiptCashTableColumns(
  onOpenVoucher: (row: ReceiptPaymentListItem) => void,
) {
  return useMemo(
    (): TableColumn<ReceiptPaymentListItem>[] => [
      {
        key: "documentDate",
        label: "Ngày",
        width: 110,
        render: (r) =>
          new Date(`${r.voucherDate}T12:00:00`).toLocaleDateString(
            "vi-VN",
            LEDGER_CASH_VI_DATE,
          ),
      },
      {
        key: "voucherNo",
        label: "Số chứng từ",
        width: 130,
        render: (r) => (
          <VoucherLink
            code={r.documentNumber}
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
        render: (r) =>
          receiptPaymentDocumentTypeLabel(r.kind, r.referenceType),
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
        render: (r) => r.reason,
      },
    ],
    [onOpenVoucher],
  );
}
