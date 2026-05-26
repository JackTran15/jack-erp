import type { TabItem } from "../../../../components/tabs";
import { DOCUMENT_SECTION_LABELS } from "../../ledger-cash/ledger-cash.constants";
import { LedgerCashVoucherPurposeEnum } from "../../ledger-cash/ledger-cash.types";

export enum ReceiptVoucherDetailTabEnum {
  LINES = "lines",
  DOCUMENTS = "documents",
}

export const RECEIPT_VOUCHER_DETAIL_TAB_LABELS: Record<ReceiptVoucherDetailTabEnum, string> = {
  [ReceiptVoucherDetailTabEnum.LINES]: DOCUMENT_SECTION_LABELS.DETAIL,
  [ReceiptVoucherDetailTabEnum.DOCUMENTS]: DOCUMENT_SECTION_LABELS.DOCUMENT,
};

export const RECEIPT_VOUCHER_DETAIL_TABS: TabItem<ReceiptVoucherDetailTabEnum>[] =
  [
    {
      id: ReceiptVoucherDetailTabEnum.LINES,
      label: RECEIPT_VOUCHER_DETAIL_TAB_LABELS[ReceiptVoucherDetailTabEnum.LINES],
    },
    {
      id: ReceiptVoucherDetailTabEnum.DOCUMENTS,
      label:
        RECEIPT_VOUCHER_DETAIL_TAB_LABELS[ReceiptVoucherDetailTabEnum.DOCUMENTS],
    },
  ];

export const RECEIPT_VOUCHER_PURPOSE_OPTIONS = [
  { value: LedgerCashVoucherPurposeEnum.OTHER, label: "Khác" },
  {
    value: LedgerCashVoucherPurposeEnum.DEBT_COLLECTION,
    label: "Thu nợ",
  },
] as const;
