import { useMemo, type RefObject } from "react";

import { PosErrorDialog } from "@erp/pos/components/common/PosErrorDialog/PosErrorDialog";
import { CancelInvoiceConfirmDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CancelInvoiceConfirmDialog/CancelInvoiceConfirmDialog";
import { CustomerCreateDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerCreateDialog/CustomerCreateDialog";
import { CustomerDetailDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/CustomerDetailDialog";
import { OversellCheckoutConfirmDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/OversellCheckoutConfirmDialog/OversellCheckoutConfirmDialog";
import { useCheckoutCancelFlow } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-cancel-flow";
import { useCheckoutCustomer } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-customer";
import { useCheckoutOversellFlow } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-oversell-flow";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerUtils";
import {
  computeOversellLines,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface CheckoutDialogsProps {
  /**
   * Ref để return focus về sau khi CustomerCreateDialog đóng:
   *  - Khi vừa tạo khách thành công → focus về paymentAmount (để user trả tiền).
   *  - Còn lại → focus về customerSearch.
   */
  paymentReturnFocusRef: RefObject<HTMLInputElement | null>;
  customerReturnFocusRef: RefObject<HTMLInputElement | null>;
}

/**
 * Aggregates tất cả dialog của Checkout. Mọi state/handler đọc từ stores+hooks;
 * Page chỉ truyền 2 refs cho focus restore sau dialog close.
 */
export const CheckoutDialogs = ({
  paymentReturnFocusRef,
  customerReturnFocusRef,
}: CheckoutDialogsProps) => {
  const {
    selectedCustomer,
    createCustomerOpen,
    createDefaultQuery,
    customerDetailOpen,
    closeCreateDialog,
    handleCustomerCreated,
    handleCustomerSubmitted,
    closeCustomerDetail,
  } = useCheckoutCustomer();

  const cancelInvoiceOpen = usePosCheckoutUiStore((s) => s.cancelInvoiceOpen);
  const closeCancelInvoice = usePosCheckoutUiStore((s) => s.closeCancelInvoice);
  const oversellOpen = usePosCheckoutUiStore((s) => s.oversellOpen);
  const closeOversell = usePosCheckoutUiStore((s) => s.closeOversell);
  const cartError = usePosCheckoutUiStore((s) => s.cartError);
  const clearCartError = usePosCheckoutUiStore((s) => s.clearCartError);
  const createCustomerSucceeded = usePosCheckoutUiStore(
    (s) => s.createCustomerSucceeded,
  );

  const sessionState = usePosCheckoutSessionStore();
  const oversellLines = useMemo(
    () => computeOversellLines(sessionState),
    [sessionState],
  );

  const { confirmCancelInvoice } = useCheckoutCancelFlow();
  const { confirmOversell } = useCheckoutOversellFlow();

  return (
    <>
      <CustomerCreateDialog
        open={createCustomerOpen}
        onClose={closeCreateDialog}
        defaultQuery={createDefaultQuery}
        returnFocusTo={
          createCustomerSucceeded ? paymentReturnFocusRef : customerReturnFocusRef
        }
        onCreated={handleCustomerCreated}
      />

      {selectedCustomer ? (
        <CustomerDetailDialog
          open={customerDetailOpen}
          onClose={closeCustomerDetail}
          customerId={selectedCustomer.id}
          fallbackName={formatCustomerDisplay(selectedCustomer)}
          onConfirm={closeCustomerDetail}
          onCustomerUpdated={handleCustomerSubmitted}
        />
      ) : null}

      <CancelInvoiceConfirmDialog
        open={cancelInvoiceOpen}
        onClose={closeCancelInvoice}
        onConfirm={confirmCancelInvoice}
      />

      <OversellCheckoutConfirmDialog
        open={oversellOpen}
        onClose={closeOversell}
        lines={oversellLines}
        onConfirm={confirmOversell}
      />

      <PosErrorDialog
        open={Boolean(cartError)}
        message={cartError}
        onClose={clearCartError}
      />
    </>
  );
};
