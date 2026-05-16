import type { RefObject } from "react";

import { PaymentSummaryPanel } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PaymentSummaryPanel";

export interface CheckoutRightPaneProps {
  customerSearchRef: RefObject<HTMLInputElement | null>;
  paymentAmountRef: RefObject<HTMLInputElement | null>;
  addCustomerButtonRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Wrapper concrete cho CustomerRow — chuyển 3 refs xuống PaymentSummaryPanel.
 * State + handlers do PaymentSummaryPanel và các sub-components tự consume
 * stores/hooks.
 */
export function CheckoutRightPane({
  customerSearchRef,
  paymentAmountRef,
  addCustomerButtonRef,
}: CheckoutRightPaneProps) {
  return (
    <PaymentSummaryPanel
      customerSearchRef={customerSearchRef}
      paymentAmountRef={paymentAmountRef}
      addCustomerButtonRef={addCustomerButtonRef}
    />
  );
}
