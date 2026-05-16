import { useState } from "react";
import { QrIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import {
  PosVietQrPaymentDialog,
  type QrPaymentInfo,
} from "@erp/pos/components/common/PosVietQrPaymentDialog/PosVietQrPaymentDialog";

export interface QrPaymentButtonProps {
  /** Account + amount data shown inside the VietQR dialog. */
  payment: QrPaymentInfo;
}

/** Outlined full-width button that opens the VietQR payment dialog. */
export function QrPaymentButton({ payment }: QrPaymentButtonProps) {
  const [open, setOpen] = useState(false);

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
        payment={payment}
      />
    </>
  );
}
