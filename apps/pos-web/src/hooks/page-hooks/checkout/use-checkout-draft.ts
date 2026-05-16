import { useCallback } from "react";

import { formatCustomerDisplay } from "@erp/pos/lib/common/customerApi";
import {
  CheckoutVariantEnum,
  type DraftInvoice,
} from "@erp/pos/lib/page-libs/checkout/checkout.types";
import { resolvePaymentMethodLabel } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { resetCheckoutDraftState } from "@erp/pos/lib/page-libs/checkout/resetCheckoutDraftState";
import { PAYMENT_METHODS } from "@erp/pos/constants/checkout.constant";
import {
  computeLinesForDraftSingle,
  selectGrandTotal,
  selectHasAnyCartLines,
  selectCheckoutVariant,
  selectPurchaseCart,
  selectReturnCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutCustomerStore } from "@erp/pos/stores/page-stores/checkout/checkout-customer.store";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutDraftResult {
  saveDraft: () => void;
}

/**
 * Zero-input adapter: đọc cart/payment/customer từ stores, snapshot DraftInvoice
 * và push vào session store. Sau đó reset session + ui draft.
 */
export const useCheckoutDraft = (): UseCheckoutDraftResult => {
  const saveDraft = useCallback(() => {
    const sessionState = usePosCheckoutSessionStore.getState();
    if (!selectHasAnyCartLines(sessionState)) return;

    const checkoutVariant = selectCheckoutVariant(sessionState);
    const purchaseCart = selectPurchaseCart(sessionState);
    const returnCart = selectReturnCart(sessionState);
    const grandTotal = selectGrandTotal(sessionState);
    const linesForDraftSingle = computeLinesForDraftSingle(sessionState);

    const selectedCustomer =
      usePosCheckoutCustomerStore.getState().selectedCustomer;
    const paymentLines = usePosCheckoutPaymentStore.getState().paymentLines;

    const now = new Date();
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = String(sessionState.nextDraftSeq()).padStart(4, "0");
    const invoiceNumber = `${yy}${mm}${dd}${seq}`;

    const paymentsSnapshot = paymentLines
      .filter((l) => l.amount > 0)
      .map((l) => ({
        method: l.method,
        label: resolvePaymentMethodLabel(l.method, PAYMENT_METHODS),
        amount: l.amount,
      }));

    const snapshot: DraftInvoice = {
      id: crypto.randomUUID(),
      invoiceNumber,
      customerId: selectedCustomer?.id ?? null,
      customerName: selectedCustomer
        ? formatCustomerDisplay(selectedCustomer)
        : null,
      customerPhone: selectedCustomer?.phone ?? null,
      createdAt: now,
      lines: linesForDraftSingle.map((l) => ({ ...l })),
      total: grandTotal,
      payments: paymentsSnapshot.length > 0 ? paymentsSnapshot : undefined,
      checkoutVariant,
      quickExchangePurchase:
        checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE
          ? purchaseCart.map((l) => ({ ...l }))
          : undefined,
      quickExchangeReturn:
        checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE
          ? returnCart.map((l) => ({ ...l }))
          : undefined,
    };

    sessionState.addDraft(snapshot);
    usePosCheckoutUiStore
      .getState()
      .setAnnouncement(`Đã lưu tạm hóa đơn ${invoiceNumber}.`);
    sessionState.resetActiveSessionAfterCheckout();
    resetCheckoutDraftState();
  }, []);

  return { saveDraft };
};
