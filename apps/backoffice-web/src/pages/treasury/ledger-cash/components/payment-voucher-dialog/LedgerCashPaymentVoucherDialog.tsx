import { FormShellDialog } from "../../../../../components/form-shell-dialog";
import {
  isGoodsReceiptPaymentVoucher,
  type LedgerCashVoucherDetail,
} from "../../ledger-cash.types";
import { PaymentVoucherGoodsBody } from "./PaymentVoucherGoodsBody";
import { SimplePaymentVoucherBody } from "./SimplePaymentVoucherBody";
import { usePaymentVoucherSheetTab } from "./usePaymentVoucherSheetTab";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: LedgerCashVoucherDetail | null;
}

export function LedgerCashPaymentVoucherDialog({
  open,
  onOpenChange,
  detail,
}: Props) {
  const { sheetTab, setSheetTab } = usePaymentVoucherSheetTab(
    open,
    detail?.voucherNo,
  );

  if (!detail) return null;

  const isGoodsReceipt = isGoodsReceiptPaymentVoucher(detail);

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isGoodsReceipt ? "Phiếu nhập hàng" : "Phiếu chi"}
      defaultWidth={isGoodsReceipt ? 1040 : 920}
    >
      {isGoodsReceipt ? (
        <PaymentVoucherGoodsBody
          detail={detail}
          sheetTab={sheetTab}
          onSheetTabChange={setSheetTab}
        />
      ) : (
        <SimplePaymentVoucherBody detail={detail} />
      )}
    </FormShellDialog>
  );
}
