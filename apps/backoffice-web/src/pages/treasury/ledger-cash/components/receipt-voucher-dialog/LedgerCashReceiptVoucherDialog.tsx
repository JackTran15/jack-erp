import { FormShellDialog } from "../../../../../components/form-shell-dialog";
import type { LedgerCashVoucherDetail } from "../../ledger-cash.types";
import { ReceiptVoucherBody } from "./ReceiptVoucherBody";
import { useReceiptVoucherDetailTab } from "./useReceiptVoucherDetailTab";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: LedgerCashVoucherDetail | null;
}

export function LedgerCashReceiptVoucherDialog({
  open,
  onOpenChange,
  detail,
}: Props) {
  const { detailTab, setDetailTab } = useReceiptVoucherDetailTab(
    open,
    detail?.voucherNo,
  );

  if (!detail) return null;

  return (
    <FormShellDialog open={open} onOpenChange={onOpenChange} title="Phiếu thu">
      <ReceiptVoucherBody
        detail={detail}
        detailTab={detailTab}
        onDetailTabChange={setDetailTab}
      />
    </FormShellDialog>
  );
}
