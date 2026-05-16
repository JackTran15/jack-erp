import { PosErrorDialog } from "@erp/pos/components/common/PosErrorDialog/PosErrorDialog";
import { CancelInvoiceConfirmDialog } from "@erp/pos/components/page-components/Checkout/Dialog/CancelInvoiceConfirmDialog/CancelInvoiceConfirmDialog";
import { CustomerCreateDialog } from "@erp/pos/components/page-components/Checkout/Dialog/CustomerCreateDialog/CustomerCreateDialog";
import { OversellCheckoutConfirmDialog } from "@erp/pos/components/page-components/Checkout/Dialog/OversellCheckoutConfirmDialog/OversellCheckoutConfirmDialog";
import type { CustomerCreateDialogProps } from "@erp/pos/lib/page-libs/checkout/customerCreate.types";
import type { CartLine } from "@erp/pos/lib/page-libs/checkout/checkout.types";

export interface CheckoutDialogsProps {
  /** Customer create dialog props. */
  createCustomer: CustomerCreateDialogProps;
  /** Customer edit dialog props (uses CustomerCreateDialog with mode="edit"). */
  editCustomer: CustomerCreateDialogProps;

  cancelInvoiceOpen: boolean;
  onCloseCancelInvoice: () => void;
  onConfirmCancelInvoice: () => void;

  oversellOpen: boolean;
  onCloseOversell: () => void;
  oversellLines: CartLine[];
  onConfirmOversell: () => Promise<void> | void;

  cartError: string;
  onCloseCartError: () => void;
}

export const CheckoutDialogs = ({
  createCustomer,
  editCustomer,
  cancelInvoiceOpen,
  onCloseCancelInvoice,
  onConfirmCancelInvoice,
  oversellOpen,
  onCloseOversell,
  oversellLines,
  onConfirmOversell,
  cartError,
  onCloseCartError,
}: CheckoutDialogsProps) => {
  return (
    <>
      <CustomerCreateDialog {...createCustomer} />
      <CustomerCreateDialog {...editCustomer} />

      <CancelInvoiceConfirmDialog
        open={cancelInvoiceOpen}
        onClose={onCloseCancelInvoice}
        onConfirm={onConfirmCancelInvoice}
      />

      <OversellCheckoutConfirmDialog
        open={oversellOpen}
        onClose={onCloseOversell}
        lines={oversellLines}
        onConfirm={onConfirmOversell}
      />

      <PosErrorDialog
        open={Boolean(cartError)}
        message={cartError}
        onClose={onCloseCartError}
      />
    </>
  );
};
