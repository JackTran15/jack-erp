import { useEffect, useState } from "react";
import { ReceiptVoucherDetailTabEnum } from "./receipt-voucher-dialog.constants";

export function useReceiptVoucherDetailTab(open: boolean, voucherNo?: string) {
  const [detailTab, setDetailTab] = useState<ReceiptVoucherDetailTabEnum>(
    ReceiptVoucherDetailTabEnum.LINES,
  );

  useEffect(() => {
    if (open) {
      setDetailTab(ReceiptVoucherDetailTabEnum.LINES);
    }
  }, [open, voucherNo]);

  return { detailTab, setDetailTab };
}
