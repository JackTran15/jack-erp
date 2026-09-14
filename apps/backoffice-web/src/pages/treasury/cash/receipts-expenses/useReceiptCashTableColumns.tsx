import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "../../../../components/status/StatusBadge";
import { VoucherLink } from "../../documents";
import { TABLE_NUM_CLASS } from "../../ledger-cash/ledger-cash.constants";
import {
  CASH_VOUCHER_STATUS_LABEL,
  receiptPaymentDocumentTypeLabel,
} from "../../cash-vouchers.labels";
import {
  CashVoucherStatus,
  type ReceiptPaymentListItem,
} from "../../cash-vouchers.types";
import {
  RECEIPT_CASH_DOCUMENT_TYPE_FILTER_OPTIONS,
  RECEIPT_CASH_STATUS_FILTER_OPTIONS,
} from "./receipt-cash.constants";

const STATUS_BADGE_VARIANT: Record<CashVoucherStatus, StatusBadgeVariant> = {
  [CashVoucherStatus.DRAFT]: "neutral",
  [CashVoucherStatus.POSTED]: "success",
  [CashVoucherStatus.REVERSED]: "warning",
};

/**
 * `voucherDate` is a plain `YYYY-MM-DD` string — split it instead of going
 * through `new Date()`, which reinterprets it as UTC midnight and can roll
 * back a day in negative-offset timezones.
 */
function formatPlainDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function useReceiptCashTableColumns(
  onOpenVoucher: (row: ReceiptPaymentListItem) => void,
) {
  return useMemo(
    (): TableColumn<ReceiptPaymentListItem>[] => [
      {
        key: "voucherDate",
        label: "Ngày thu/chi",
        width: 110,
        filterKind: "date-range",
        render: (r) => formatPlainDate(r.voucherDate),
      },
      {
        key: "documentNumber",
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
        key: "documentKind",
        label: "Loại chứng từ",
        width: 200,
        filterKind: "select",
        filterOptions: RECEIPT_CASH_DOCUMENT_TYPE_FILTER_OPTIONS,
        render: (r) => receiptPaymentDocumentTypeLabel(r.kind, r.referenceType),
      },
      {
        key: "status",
        label: "Trạng thái",
        width: 120,
        filterKind: "select",
        filterOptions: RECEIPT_CASH_STATUS_FILTER_OPTIONS,
        render: (r) => (
          <StatusBadge variant={STATUS_BADGE_VARIANT[r.status]}>
            {CASH_VOUCHER_STATUS_LABEL[r.status]}
          </StatusBadge>
        ),
      },
      {
        key: "totalAmount",
        label: "Tổng tiền",
        width: 130,
        filterKind: "number-range",
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
        key: "personName",
        label: "Người nộp/nhận",
        width: 160,
        render: (r) => r.personName,
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
