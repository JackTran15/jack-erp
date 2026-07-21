import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "../../../../components/status/StatusBadge";
import { VoucherLink } from "../../documents";
import {
  LEDGER_CASH_VI_DATE,
  TABLE_NUM_CLASS,
} from "../../ledger-cash/ledger-cash.constants";
import { BANK_VOUCHER_STATUS_LABEL } from "../../bank-vouchers.labels";
import { BankVoucherStatus } from "../../bank-vouchers.types";
import {
  RECEIPT_DEPOSIT_DOCUMENT_TYPE_FILTER_OPTIONS,
  RECEIPT_DEPOSIT_STATUS_FILTER_OPTIONS,
} from "./receipt-deposit.constants";
import type { ReceiptDepositListItem } from "./receipt-deposit.types";
import { receiptDepositDocumentTypeLabel } from "./receipt-deposit.utils";

const STATUS_BADGE_VARIANT: Record<BankVoucherStatus, StatusBadgeVariant> = {
  [BankVoucherStatus.DRAFT]: "neutral",
  [BankVoucherStatus.PENDING_APPROVAL]: "info",
  [BankVoucherStatus.POSTED]: "success",
  [BankVoucherStatus.REVERSED]: "warning",
};

export function useReceiptDepositTableColumns(
  onOpenVoucher: (row: ReceiptDepositListItem) => void,
) {
  return useMemo(
    (): TableColumn<ReceiptDepositListItem>[] => [
      {
        key: "docDate",
        label: "Ngày",
        width: 110,
        filterKind: "date-range",
        render: (r) =>
          new Date(`${r.docDate}T12:00:00`).toLocaleDateString(
            "vi-VN",
            LEDGER_CASH_VI_DATE,
          ),
      },
      {
        key: "documentNumber",
        label: "Số chứng từ",
        width: 130,
        render: (r) => (
          <div className="flex items-center gap-1.5">
            <VoucherLink
              code={r.documentNumber}
              clickable
              onClick={() => onOpenVoucher(r)}
            />
            {r.isReversed ? (
              <StatusBadge variant="warning">Đảo bút</StatusBadge>
            ) : null}
          </div>
        ),
      },
      {
        key: "kind",
        label: "Loại chứng từ",
        width: 200,
        filterKind: "select",
        filterOptions: RECEIPT_DEPOSIT_DOCUMENT_TYPE_FILTER_OPTIONS,
        render: (r) => receiptDepositDocumentTypeLabel(r.kind),
      },
      {
        key: "status",
        label: "Trạng thái",
        width: 120,
        filterKind: "select",
        filterOptions: RECEIPT_DEPOSIT_STATUS_FILTER_OPTIONS,
        render: (r) => (
          <StatusBadge variant={STATUS_BADGE_VARIANT[r.status]}>
            {BANK_VOUCHER_STATUS_LABEL[r.status]}
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
        key: "accountLabel",
        label: "Số tài khoản",
        width: 200,
        render: (r) =>
          r.depositAccountName
            ? r.depositAccountNo
              ? `${r.depositAccountName} (${r.depositAccountNo})`
              : r.depositAccountName
            : "—",
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
