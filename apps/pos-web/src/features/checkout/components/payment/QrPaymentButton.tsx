import { QrIcon } from "../icons/Icon";

export interface QrPaymentButtonProps {
  onClick?: () => void;
}

/** Outlined full-width button that triggers QR-payment printing. */
export function QrPaymentButton({ onClick }: QrPaymentButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
    >
      <QrIcon size={16} className="text-gray-500" />
      In QR thanh toán
    </button>
  );
}
