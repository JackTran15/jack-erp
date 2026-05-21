import { useMemo, useRef, useState } from "react";

import { DropdownButton } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CustomerSection/PaymentSubTopBar/DropdownButton/DropdownButton";
import { SaleChannelPopover } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CustomerSection/PaymentSubTopBar/SaleChannelPopover/SaleChannelPopover";
import {
  DEFAULT_SALE_CHANNEL_ID,
  SALE_CHANNELS,
} from "@erp/pos/constants/checkout.constant";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";

/**
 * Mini topbar at the top of the payment panel: date/time on the left,
 * sale-channel dropdown on the right. Datetime tính khi mount (snapshot).
 * Click vào dropdown mở popover chọn kênh bán hàng (SaleChannelPopover).
 */
export function PaymentSubTopBar() {
  const datetime = useMemo(() => formatViDateTime(new Date()), []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState(
    DEFAULT_SALE_CHANNEL_ID,
  );

  const selectedLabel = useMemo(
    () =>
      SALE_CHANNELS.find((c) => c.id === selectedChannelId)?.label ??
      SALE_CHANNELS[0]!.label,
    [selectedChannelId],
  );

  return (
    <div className="flex h-9 items-center justify-between gap-2 text-[13px] text-gray-500">
      <span>{datetime}</span>
      <DropdownButton
        ref={triggerRef}
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="border-transparent bg-transparent hover:border-gray-200"
      >
        {selectedLabel}
      </DropdownButton>
      <SaleChannelPopover
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        selectedId={selectedChannelId}
        onSelect={(id) => {
          setSelectedChannelId(id);
          setOpen(false);
        }}
      />
    </div>
  );
}
