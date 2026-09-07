import { useEffect } from "react";
import { CheckoutAnnouncer } from "@erp/pos/components/page-components/Checkout/CheckoutAnnouncer/CheckoutAnnouncer";
import { CheckoutDialogs } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CheckoutDialogs";
import { CheckoutLeftPane } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/CheckoutLeftPane";
import { CheckoutRightPane } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/CheckoutRightPane";
import { useCheckoutBootstrap } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-bootstrap";
import { useCheckoutFocusManager } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-focus-manager";
import { useCheckoutHotkeys } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-hotkeys";
import { useCheckoutPromotionPreview } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-promotion-preview";
import { useSyncCartOnHand } from "@erp/pos/hooks/page-hooks/checkout/use-sync-cart-on-hand";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export function CheckoutPage() {
  const focus = useCheckoutFocusManager();

  useCheckoutBootstrap();
  useCheckoutHotkeys({ refs: focus.refs });
  useSyncCartOnHand();
  useCheckoutPromotionPreview();

  // Mỗi lần vào màn hình bán hàng (đăng nhập lần đầu hoặc quay lại từ trang
  // khác), ô quét mã vạch (F3) phải sẵn sàng nhận focus ngay.
  useEffect(() => {
    usePosCheckoutUiStore.getState().requestProductSearchFocus();
  }, []);

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
