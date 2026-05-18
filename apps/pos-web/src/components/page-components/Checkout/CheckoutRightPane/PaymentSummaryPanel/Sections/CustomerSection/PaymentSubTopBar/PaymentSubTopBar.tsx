import { useMemo } from "react";

import { DropdownButton } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CustomerSection/PaymentSubTopBar/DropdownButton/DropdownButton";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";

const DEFAULT_SALE_MODE = "Tại cửa hàng";

/**
 * Mini topbar at the top of the payment panel: date/time on the left,
 * sale-mode dropdown on the right. Datetime tính khi mount (snapshot).
 */
export function PaymentSubTopBar() {
  const datetime = useMemo(() => formatViDateTime(new Date()), []);

  return (
    <div className="flex h-9 items-center justify-between gap-2 text-[13px] text-gray-500">
      <span>{datetime}</span>
      <DropdownButton
        size="sm"
        className="border-transparent bg-transparent hover:border-gray-200"
      >
        {DEFAULT_SALE_MODE}
      </DropdownButton>
    </div>
  );
}
