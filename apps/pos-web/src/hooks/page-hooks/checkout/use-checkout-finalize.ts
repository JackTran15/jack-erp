import { useCallback, type FormEvent } from "react";

import { useInvoicePrinter } from "@erp/pos/hooks/page-hooks/checkout/use-invoice-printer";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerApi";
import { buildCheckoutInvoicePayload } from "@erp/pos/lib/page-libs/checkout/checkoutReceiptFactory";
import {
  getOversellSaleLines,
  paymentLabel,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { validateCheckout } from "@erp/pos/lib/page-libs/checkout/checkoutValidation";
import type { InvoicePayload } from "@erp/pos/lib/page-libs/checkout/printing/types";
import { resetCheckoutDraftState } from "@erp/pos/lib/page-libs/checkout/resetCheckoutDraftState";
import { PAYMENT_METHODS } from "@erp/pos/constants/checkout.constant";
import {
  computeReceiptLines,
  selectHasAnyCartLines,
  selectPurchaseCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutCustomerStore } from "@erp/pos/stores/page-stores/checkout/checkout-customer.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutFinalizeResult {
  finalizeCheckoutAndPrint: (options?: {
    bypassOversellModal?: boolean;
  }) => Promise<void>;
}

/**
 * Zero-input adapter: đọc cart/payment/customer/ui từ stores, return
 * `finalizeCheckoutAndPrint(options?)` cho component gọi.
 */
export const useCheckoutFinalize = (): UseCheckoutFinalizeResult => {
  const payment = useCheckoutPayment();
  const invoicePrinter = useInvoicePrinter();

  const buildReceiptPayload = useCallback((): InvoicePayload | null => {
    const sessionState = usePosCheckoutSessionStore.getState();
    return buildCheckoutInvoicePayload({
      printInvoice: payment.printInvoice,
      cart: computeReceiptLines(sessionState),
      grandTotal: payment.grandTotal,
      totalPaid: payment.totalPaid,
      paymentLines: payment.paymentLines,
      primaryMethodLabel: payment.primaryMethodLabel,
      methods: PAYMENT_METHODS,
      keepChange: payment.keepChange,
      debt: payment.debt,
    });
  }, [
    payment.printInvoice,
    payment.grandTotal,
    payment.totalPaid,
    payment.paymentLines,
    payment.primaryMethodLabel,
    payment.keepChange,
    payment.debt,
  ]);

  const printReceiptIfNeeded = useCallback(
    async (payload: InvoicePayload | null) => {
      if (!payload) return;
      try {
        await invoicePrinter.print(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Lỗi in hóa đơn:", err);
      }
    },
    [invoicePrinter],
  );

  const handleCheckout = useCallback(
    (
      e: FormEvent | { preventDefault: () => void },
      options?: { bypassOversellModal?: boolean },
    ): boolean => {
      e.preventDefault();
      const sessionState = usePosCheckoutSessionStore.getState();
      const selectedCustomer =
        usePosCheckoutCustomerStore.getState().selectedCustomer;
      const purchaseCart = selectPurchaseCart(sessionState);
      const result = validateCheckout({
        hasAnyCartLines: selectHasAnyCartLines(sessionState),
        debt: payment.debt,
        keepChange: payment.keepChange,
        selectedCustomer,
        purchaseCart,
        settlementGrandTotal: payment.settlementGrandTotal,
        settlementAbs: payment.settlementAbs,
        totalPaid: payment.totalPaid,
        changeAmount: payment.changeAmount,
        shortageAmount: payment.shortageAmount,
      });
      const ui = usePosCheckoutUiStore.getState();
      if (!result.ok) {
        ui.setCartError(result.message);
        return false;
      }
      if (
        !options?.bypassOversellModal &&
        getOversellSaleLines(purchaseCart).length > 0
      ) {
        ui.openOversell();
        return false;
      }
      const who = selectedCustomer
        ? ` cho ${formatCustomerDisplay(selectedCustomer)}`
        : " (khách lẻ)";
      ui.setAnnouncement(
        `Đã ghi nhận thanh toán${who}, ${new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
          maximumFractionDigits: 0,
        }).format(payment.settlementGrandTotal)}, ${paymentLabel(payment.primaryMethod)}.`,
      );
      usePosCheckoutSessionStore.getState().resetActiveSessionAfterCheckout();
      resetCheckoutDraftState();
      return true;
    },
    [
      payment.debt,
      payment.keepChange,
      payment.settlementGrandTotal,
      payment.settlementAbs,
      payment.totalPaid,
      payment.changeAmount,
      payment.shortageAmount,
      payment.primaryMethod,
    ],
  );

  const finalizeCheckoutAndPrint = useCallback(
    async (options?: { bypassOversellModal?: boolean }) => {
      const payload = buildReceiptPayload();
      const ok = handleCheckout({ preventDefault: () => {} }, options);
      if (!ok) return;
      await printReceiptIfNeeded(payload);
    },
    [buildReceiptPayload, handleCheckout, printReceiptIfNeeded],
  );

  return { finalizeCheckoutAndPrint };
};
