import type { RefObject } from "react";
import { POS_HOTKEYS, usePosHotkey } from "@erp/pos/components/hotkeys";

interface UseCheckoutHotkeysInput {
  /** Product search input (POSToolbar). F3 focuses here. */
  productSearchRef: RefObject<HTMLInputElement | null>;
  /** Customer search input (PaymentSummaryPanel). F4 focuses here. */
  customerSearchRef: RefObject<HTMLInputElement | null>;
  /** Amount input of the first payment line. F12 focuses and selects here. */
  paymentAmountRef: RefObject<HTMLInputElement | null>;
  /** F9 only fires when the cart has at least one line. */
  hasCartItems: boolean;
  /** Complete the invoice (F9). */
  onCheckout: () => void;
  /** Save as draft (F10). Pass `undefined` to disable (e.g. in return/exchange mode). */
  onSaveDraft?: () => void;
}

/**
 * Registers all keyboard shortcuts for the Checkout page (CheckoutPageV2).
 *
 * Each key is declared via `usePosHotkey(POS_HOTKEYS.checkout.*, callback)`.
 * Never access `useHotkey` from TanStack directly — always go through the
 * registry so every key has a description and appears in devtools.
 *
 * Keys (Phase 1 — MISA flow):
 *   - F3  : Focus product search input
 *   - F4  : Focus customer search input
 *   - F9  : Complete & print invoice (only when cart is not empty)
 *   - F10 : Save as draft (only when `onSaveDraft` is provided)
 *   - F12 : Focus the amount input of the first payment line (CASH)
 */
export function useCheckoutHotkeys({
  productSearchRef,
  customerSearchRef,
  paymentAmountRef,
  hasCartItems,
  onCheckout,
  onSaveDraft,
}: UseCheckoutHotkeysInput): void {
  usePosHotkey(POS_HOTKEYS.checkout.focusProductSearch, () => {
    productSearchRef.current?.focus();
    productSearchRef.current?.select();
  });

  usePosHotkey(POS_HOTKEYS.checkout.focusCustomerSearch, () => {
    customerSearchRef.current?.focus();
    customerSearchRef.current?.select();
  });

  usePosHotkey(POS_HOTKEYS.checkout.focusPayment, () => {
    paymentAmountRef.current?.focus();
    paymentAmountRef.current?.select();
  });

  usePosHotkey(
    POS_HOTKEYS.checkout.completeCheckout,
    () => onCheckout(),
    { enabled: hasCartItems },
  );

  usePosHotkey(
    POS_HOTKEYS.checkout.saveDraft,
    () => onSaveDraft?.(),
    { enabled: Boolean(onSaveDraft) },
  );
}
