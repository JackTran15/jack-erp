import type { TabItem } from "../../../../../components/tabs";
import {
  LedgerCashVoucherPaymentModeEnum,
  LedgerCashVoucherSheetTabEnum,
} from "../../ledger-cash.types";

export const PAYMENT_VOUCHER_SHEET_TAB_LABELS: Record<
  LedgerCashVoucherSheetTabEnum,
  string
> = {
  [LedgerCashVoucherSheetTabEnum.GOODS_RECEIPT]: "Phiếu nhập",
  [LedgerCashVoucherSheetTabEnum.PAYMENT]: "Phiếu chi",
};

export const PAYMENT_VOUCHER_SHEET_TABS: TabItem<LedgerCashVoucherSheetTabEnum>[] =
  [
    {
      id: LedgerCashVoucherSheetTabEnum.GOODS_RECEIPT,
      label:
        PAYMENT_VOUCHER_SHEET_TAB_LABELS[LedgerCashVoucherSheetTabEnum.GOODS_RECEIPT],
    },
    {
      id: LedgerCashVoucherSheetTabEnum.PAYMENT,
      label: PAYMENT_VOUCHER_SHEET_TAB_LABELS[LedgerCashVoucherSheetTabEnum.PAYMENT],
    },
  ];

export const PAYMENT_VOUCHER_MODE_OPTIONS = [
  {
    value: LedgerCashVoucherPaymentModeEnum.SUPPLIER_DEBT,
    label: "Ghi nợ nhà cung cấp",
  },
  {
    value: LedgerCashVoucherPaymentModeEnum.PAY_NOW,
    label: "Thanh toán ngay",
  },
] as const;
