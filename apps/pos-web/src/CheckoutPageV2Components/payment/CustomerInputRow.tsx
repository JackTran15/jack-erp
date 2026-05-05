import { forwardRef } from "react";
import {
  GiftIcon,
  PlusCircleIcon,
  QrIcon,
  ReceiptIcon,
  UserIcon,
} from "../icons/Icon";
import { IconButton } from "../common/IconButton";
import { KeyboardHint } from "../common/KeyboardHint";

export interface CustomerInputRowProps {
  value: string;
  onChange: (next: string) => void;
  onAddCustomer?: () => void;
  onScanQr?: () => void;
  onOpenReceipts?: () => void;
  onApplyVoucher?: () => void;
}

/**
 * Customer search row at the top of the payment panel. Leading user icon,
 * trailing QR / add / receipt / gift utility actions.
 */
export const CustomerInputRow = forwardRef<
  HTMLInputElement,
  CustomerInputRowProps
>(function CustomerInputRow(
  { value, onChange, onAddCustomer, onScanQr, onOpenReceipts, onApplyVoucher },
  ref,
) {
  return (
    <div className="flex h-10 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
      <UserIcon size={16} className="text-gray-500" />
      <div className="relative min-w-0 flex-1">
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=""
          className="h-8 w-full bg-transparent text-[13px] text-gray-900 focus:outline-none"
        />
        {value.length === 0 ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-[13px] text-gray-400">
            <KeyboardHint>(F4)</KeyboardHint>&nbsp;SDT, tên khách hàng
          </span>
        ) : null}
      </div>
      <IconButton ariaLabel="Quét QR khách" icon={<QrIcon size={16} />} onClick={onScanQr} />
      <IconButton
        ariaLabel="Thêm khách mới"
        icon={<PlusCircleIcon size={16} className="text-green-500" />}
        onClick={onAddCustomer}
      />
      <IconButton
        ariaLabel="Lịch sử mua hàng"
        icon={<ReceiptIcon size={16} />}
        onClick={onOpenReceipts}
      />
      <IconButton
        ariaLabel="Voucher / quà tặng"
        icon={<GiftIcon size={16} />}
        onClick={onApplyVoucher}
      />
    </div>
  );
});
