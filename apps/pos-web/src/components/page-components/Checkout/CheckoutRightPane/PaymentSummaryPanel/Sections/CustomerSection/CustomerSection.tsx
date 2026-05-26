import type { RefObject } from "react";

import type { CustomerActionItem } from "@erp/pos/components/common/PosCustomerActions/PosCustomerActions";
import { CustomerInputRow } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CustomerSection/CustomerInputRow/CustomerInputRow";
import { PaymentSubTopBar } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CustomerSection/PaymentSubTopBar/PaymentSubTopBar";
import { SelectedCustomerCard } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CustomerSection/SelectedCustomerCard/SelectedCustomerCard";
import { useCheckoutCustomer } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-customer";

interface CustomerSectionProps {
  customerInputRef: RefObject<HTMLInputElement | null>;
  actions?: CustomerActionItem[];
  /** Khóa khách (tab `invoice_return`): chỉ hiển thị read-only, không cho đổi/tìm. */
  locked?: boolean;
}

export function CustomerSection({
  customerInputRef,
  actions,
  locked = false,
}: CustomerSectionProps) {
  const { selectedCustomer, customerFieldError } = useCheckoutCustomer();

  return (
    <>
      <div className="px-4">
        <PaymentSubTopBar />
      </div>
      <div className="relative px-4 py-2">
        {locked ? (
          selectedCustomer ? (
            <SelectedCustomerCard actions={actions} readOnly />
          ) : (
            <div className="flex h-12 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-[13px] text-gray-500">
              Khách lẻ
            </div>
          )
        ) : selectedCustomer ? (
          <SelectedCustomerCard actions={actions} />
        ) : (
          <CustomerInputRow inputRef={customerInputRef} actions={actions} />
        )}
        {!locked && customerFieldError ? (
          <p className="mt-1 text-[12px] text-red-600" role="alert">
            {customerFieldError}
          </p>
        ) : null}
      </div>
    </>
  );
}
