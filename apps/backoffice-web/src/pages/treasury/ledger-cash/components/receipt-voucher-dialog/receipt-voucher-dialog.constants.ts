import type { TabItem } from "../../../../../components/tabs";
import { FORM_SHELL_SECTION_LABELS } from "../../../../../components/form-shell-dialog";
import { LedgerCashVoucherPurposeEnum } from "../../ledger-cash.types";

export enum ReceiptVoucherDetailTabEnum {
  LINES = "lines",
  DOCUMENTS = "documents",
}

export const RECEIPT_VOUCHER_DETAIL_TAB_LABELS: Record<ReceiptVoucherDetailTabEnum, string> = {
  [ReceiptVoucherDetailTabEnum.LINES]: FORM_SHELL_SECTION_LABELS.DETAIL,
  [ReceiptVoucherDetailTabEnum.DOCUMENTS]: FORM_SHELL_SECTION_LABELS.DOCUMENT,
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
