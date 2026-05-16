import { useCallback, useMemo, useState } from "react";

export interface CheckoutDialogState {
  open: boolean;
  openDialog: () => void;
  close: () => void;
}

export interface CheckoutFlagState {
  value: boolean;
  set: (next: boolean) => void;
}

export interface CheckoutDialogs {
  cancelInvoice: CheckoutDialogState;
  oversell: CheckoutDialogState;
  createCustomerSucceeded: CheckoutFlagState;
}

export const useCheckoutDialogs = (): CheckoutDialogs => {
  const [cancelInvoiceOpen, setCancelInvoiceOpen] = useState(false);
  const [oversellOpen, setOversellOpen] = useState(false);
  const [createCustomerSucceeded, setCreateCustomerSucceeded] = useState(false);

  const openCancelInvoice = useCallback(() => setCancelInvoiceOpen(true), []);
  const closeCancelInvoice = useCallback(() => setCancelInvoiceOpen(false), []);

  const openOversell = useCallback(() => setOversellOpen(true), []);
  const closeOversell = useCallback(() => setOversellOpen(false), []);

  const setSucceeded = useCallback((next: boolean) => {
    setCreateCustomerSucceeded(next);
  }, []);

  return useMemo<CheckoutDialogs>(
    () => ({
      cancelInvoice: {
        open: cancelInvoiceOpen,
        openDialog: openCancelInvoice,
        close: closeCancelInvoice,
      },
      oversell: {
        open: oversellOpen,
        openDialog: openOversell,
        close: closeOversell,
      },
      createCustomerSucceeded: {
        value: createCustomerSucceeded,
        set: setSucceeded,
      },
    }),
    [
      cancelInvoiceOpen,
      openCancelInvoice,
      closeCancelInvoice,
      oversellOpen,
      openOversell,
      closeOversell,
      createCustomerSucceeded,
      setSucceeded,
    ],
  );
};
