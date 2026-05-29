import type { RefObject } from "react";
import { POS_HOTKEYS } from "@erp/pos/constants/hotkeys.constant";
import { usePosHotkey } from "@erp/pos/hooks/common/use-pos-hotkey";
import { useCheckoutActions } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-actions";
import { useCheckoutDraft } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-draft";
import { useCheckoutEstimate } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-estimate";
import {
  selectHasAnyCartLines,
  selectIsReturnExchangeInvoice,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

export interface CheckoutHotkeyRefs {
  productSearch: RefObject<HTMLInputElement | null>;
  customerSearch: RefObject<HTMLInputElement | null>;
  paymentAmount: RefObject<HTMLInputElement | null>;
  catalogSearch: RefObject<HTMLInputElement | null>;
  salesperson: RefObject<HTMLInputElement | null>;
  priceBook: RefObject<HTMLInputElement | null>;
}

/**
 * Register hotkeys cho Checkout. Đọc state/handlers từ stores+hooks nội bộ,
 * caller chỉ truyền `refs` (focus management ở Page).
 *
 * F3 / F4 / F9 / F10 / F12 / Shift+F3 / Alt+N / Alt+B / Alt+1
 */
export function useCheckoutHotkeys({ refs }: { refs: CheckoutHotkeyRefs }): void {
  const { finalizeCheckoutAndPrint } = useCheckoutActions();
  const { saveDraft } = useCheckoutDraft();
  const { printEstimate } = useCheckoutEstimate();

  const addSession = usePosCheckoutSessionStore((s) => s.addSession);
  const hasCartItems = usePosCheckoutSessionStore(selectHasAnyCartLines);
  const isReturnExchange = usePosCheckoutSessionStore(
    selectIsReturnExchangeInvoice,
  );

  usePosHotkey(POS_HOTKEYS.checkout.focusProductSearch, () => {
    refs.productSearch.current?.focus();
    refs.productSearch.current?.select();
  });

  usePosHotkey(POS_HOTKEYS.checkout.focusCustomerSearch, () => {
    refs.customerSearch.current?.focus();
    refs.customerSearch.current?.select();
  });

  usePosHotkey(POS_HOTKEYS.checkout.focusPayment, () => {
    refs.paymentAmount.current?.focus();
    refs.paymentAmount.current?.select();
  });

  usePosHotkey(POS_HOTKEYS.checkout.focusCatalogSearch, () => {
    refs.catalogSearch.current?.focus();
    refs.catalogSearch.current?.select();
  });

  usePosHotkey(POS_HOTKEYS.checkout.focusSalesperson, () =>
    refs.salesperson.current?.focus(),
  );

  usePosHotkey(POS_HOTKEYS.checkout.focusPriceBook, () =>
    refs.priceBook.current?.focus(),
  );

  usePosHotkey(
    POS_HOTKEYS.checkout.completeCheckout,
    () => {
      void finalizeCheckoutAndPrint();
    },
    { enabled: hasCartItems },
  );

  usePosHotkey(POS_HOTKEYS.checkout.saveDraft, () => saveDraft(), {
    enabled: !isReturnExchange,
  });

  usePosHotkey(POS_HOTKEYS.checkout.printEstimate, () => void printEstimate(), {
    enabled: !isReturnExchange && hasCartItems,
  });

  usePosHotkey(POS_HOTKEYS.checkout.addSession, () => addSession());
}
