import { forwardRef } from "react";

import {
  PaymentSummaryPanel,
  type PaymentSummaryPanelProps,
} from "@erp/pos/components/page-components/Checkout/Payment/PaymentSummaryPanel/PaymentSummaryPanel";
import type { CustomerRow } from "@erp/pos/lib/common/customerApi";

export type CheckoutRightPaneProps = PaymentSummaryPanelProps<CustomerRow>;

export const CheckoutRightPane = forwardRef<
  HTMLInputElement,
  CheckoutRightPaneProps
>(function CheckoutRightPane(props, ref) {
  return <PaymentSummaryPanel<CustomerRow> ref={ref} {...props} />;
});
