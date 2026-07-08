import { CheckoutAnnouncer } from "@erp/pos/components/page-components/Checkout/CheckoutAnnouncer/CheckoutAnnouncer";
import { CheckoutDialogs } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CheckoutDialogs";
import { CheckoutLeftPane } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/CheckoutLeftPane";
import { CheckoutRightPane } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/CheckoutRightPane";
import { useCheckoutBootstrap } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-bootstrap";
import { useCheckoutFocusManager } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-focus-manager";
import { useCheckoutHotkeys } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-hotkeys";

export function CheckoutPage() {
  const focus = useCheckoutFocusManager();

  useCheckoutBootstrap();
  useCheckoutHotkeys({ refs: focus.refs });

  return (
    <div className="flex grow flex-col bg-gray-100 text-gray-900 overflow-hidden">
      <CheckoutAnnouncer />
      <div className="flex flex-1 overflow-hidden">
        <CheckoutLeftPane
          productSearchRef={focus.refs.productSearch}
          salespersonRef={focus.refs.salesperson}
          priceBookRef={focus.refs.priceBook}
          catalogSearchRef={focus.refs.catalogSearch}
        />
        <CheckoutRightPane
          customerSearchRef={focus.refs.customerSearch}
          paymentAmountRef={focus.refs.paymentAmount}
          addCustomerButtonRef={focus.refs.addCustomerButton}
        />
      </div>
      <CheckoutDialogs
        paymentReturnFocusRef={focus.refs.paymentAmount}
        customerReturnFocusRef={focus.refs.customerSearch}
      />
    </div>
  );
}
