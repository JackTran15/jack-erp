import { useState } from "react";
import { QrIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosVietQrPaymentDialog } from "@erp/pos/components/common/PosVietQrPaymentDialog/PosVietQrPaymentDialog";
import { useCheckoutGrandTotal } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-grand-total";

const QR_PAYMENT_CONFIG = {
  holderName: "HOÀNG THỊ THU",
  accountNumber: "005704060134345",
  bankCode: "VIB",
} as const;

/**
 * Outlined full-width button that opens the VietQR payment dialog. Account
 * info hard-code; amount đọc từ grandTotal hook.
 */
export function QrPaymentButton() {
  const [open, setOpen] = useState(false);
  const grandTotal = useCheckoutGrandTotal();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
      >
        <QrIcon size={16} className="text-gray-500" />
        In QR thanh toán
      </button>
      <PosVietQrPaymentDialog
        open={open}
        onClose={() => setOpen(false)}
        payment={{ ...QR_PAYMENT_CONFIG, amount: grandTotal }}
      />
    </>
  );
}
