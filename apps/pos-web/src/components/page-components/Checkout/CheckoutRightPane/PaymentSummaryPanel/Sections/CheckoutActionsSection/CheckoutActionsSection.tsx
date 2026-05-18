import { CashSuggestionList } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CheckoutActionsSection/CashSuggestionList/CashSuggestionList";
import { PaymentCTAButtons } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CheckoutActionsSection/PaymentCTAButtons/PaymentCTAButtons";
import { PrintAndOrderRow } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CheckoutActionsSection/PrintAndOrderRow/PrintAndOrderRow";

/**
 * Footer section: print/order row + cash suggestions + collect/save buttons.
 * Mỗi child tự subscribe state/hooks — không cần props.
 */
export function CheckoutActionsSection() {
  return (
    <div className="border-t border-gray-200 bg-white">
      <PrintAndOrderRow />
      <div className="py-3">
        <CashSuggestionList />
      </div>
      <PaymentCTAButtons />
    </div>
  );
}
