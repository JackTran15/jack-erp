import { DropdownButton } from "@erp/pos/components/page-components/Checkout/Common/DropdownButton/DropdownButton";

export interface PaymentSubTopBarProps {
  /** Pre-formatted datetime string, e.g. "05/05/2026 - 22:11". */
  datetime: string;
  /** Sale mode label, e.g. "Tại cửa hàng". */
  saleMode: string;
  onPickSaleMode?: () => void;
}

/**
 * Mini topbar at the top of the payment panel: date/time on the left,
 * sale-mode dropdown on the right.
 */
export function PaymentSubTopBar({
  datetime,
  saleMode,
  onPickSaleMode,
}: PaymentSubTopBarProps) {
  return (
    <div className="flex h-9 items-center justify-between gap-2 text-[13px] text-gray-500">
      <span>{datetime}</span>
      <DropdownButton
        size="sm"
        onClick={onPickSaleMode}
        className="border-transparent bg-transparent hover:border-gray-200"
      >
        {saleMode}
      </DropdownButton>
    </div>
  );
}
