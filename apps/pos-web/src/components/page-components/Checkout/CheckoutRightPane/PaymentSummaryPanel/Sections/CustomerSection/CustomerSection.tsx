import type { RefObject } from "react";

import type { CustomerActionItem } from "@erp/pos/components/common/PosCustomerActions/PosCustomerActions";
import { CustomerInputRow } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CustomerSection/CustomerInputRow/CustomerInputRow";
import { PaymentSubTopBar } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CustomerSection/PaymentSubTopBar/PaymentSubTopBar";
import { SelectedCustomerCard } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CustomerSection/SelectedCustomerCard/SelectedCustomerCard";
import { useCheckoutCustomer } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-customer";

interface CustomerSectionProps {
  customerInputRef: RefObject<HTMLInputElement | null>;
  actions?: CustomerActionItem[];
}

export function CustomerSection({
  customerInputRef,
  actions,
}: CustomerSectionProps) {
  const { selectedCustomer, customerFieldError } = useCheckoutCustomer();

  return (
    <>
      <div className="px-4">
        <PaymentSubTopBar />
      </div>
      <div className="relative px-4 py-2">
        {selectedCustomer ? (
          <SelectedCustomerCard actions={actions} />
        ) : (
          <CustomerInputRow inputRef={customerInputRef} actions={actions} />
        )}
        {customerFieldError ? (
          <p className="mt-1 text-[12px] text-red-600" role="alert">
            {customerFieldError}
          </p>
        ) : null}
      </div>
    </>
  );
}
