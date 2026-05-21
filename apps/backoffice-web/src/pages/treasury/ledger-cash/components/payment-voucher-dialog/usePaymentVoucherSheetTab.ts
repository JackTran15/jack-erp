import { useEffect, useState } from "react";
import { LedgerCashVoucherSheetTabEnum } from "../../ledger-cash.types";

export function usePaymentVoucherSheetTab(open: boolean, voucherNo?: string) {
  const [sheetTab, setSheetTab] = useState<LedgerCashVoucherSheetTabEnum>(
    LedgerCashVoucherSheetTabEnum.GOODS_RECEIPT,
  );

  useEffect(() => {
    if (open) {
      setSheetTab(LedgerCashVoucherSheetTabEnum.GOODS_RECEIPT);
    }
  }, [open, voucherNo]);

  return { sheetTab, setSheetTab };
}
