import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import { VoucherLink } from "../../documents";
import {
  LEDGER_CASH_VI_DATE,
  TABLE_NUM_CLASS,
} from "../../ledger-cash/ledger-cash.constants";
import {
  CASH_VOUCHER_STATUS_LABEL,
  receiptPaymentDocumentTypeLabel,
} from "../../cash-vouchers.labels";
import {
  CashVoucherStatus,
  type ReceiptPaymentListItem,
} from "../../cash-vouchers.types";
import { RECEIPT_CASH_DOCUMENT_TYPE_FILTER_OPTIONS } from "./receipt-cash.constants";

const STATUS_BADGE_CLASS: Record<CashVoucherStatus, string> = {
  [CashVoucherStatus.DRAFT]: "bg-gray-100 text-gray-700",
  [CashVoucherStatus.POSTED]: "bg-green-100 text-green-700",
  [CashVoucherStatus.REVERSED]: "bg-amber-100 text-amber-700",
};

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
        key: "status",
        label: "Trạng thái",
        width: 120,
        render: (r) => (
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[r.status]}`}
          >
            {CASH_VOUCHER_STATUS_LABEL[r.status]}
          </span>
        ),
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
