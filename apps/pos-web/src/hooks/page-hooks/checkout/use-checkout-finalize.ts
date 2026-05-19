import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import {
  pickAccountByCodePrefix,
  usePaymentAccountsQuery,
  useReceivableAccountsQuery,
  useRevenueAccountsQuery,
} from "@erp/pos/hooks/react-query/use-accounts";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import { useInvoicePrinter } from "@erp/pos/hooks/page-hooks/checkout/use-invoice-printer";
import {
  useCheckoutInvoiceMutation,
  useCreateInvoiceMutation,
} from "@erp/pos/hooks/react-query/use-invoices";
import type { AccountRow } from "@erp/pos/dtos/account.dto";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerApi";
import { buildCheckoutInvoicePayload } from "@erp/pos/lib/page-libs/checkout/checkoutReceiptFactory";
import {
  getOversellSaleLines,
  paymentLabel,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { validateCheckout } from "@erp/pos/lib/page-libs/checkout/checkoutValidation";
import {
  buildCheckoutInvoiceApiPayload,
  buildCreateInvoicePayload,
  type ResolveCheckoutPayloadError,
} from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
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
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutFinalizeResult {
  finalizeCheckoutAndPrint: (options?: {
    bypassOversellModal?: boolean;
  }) => Promise<void>;
  isFinalizing: boolean;
}

function describeResolveError(error: ResolveCheckoutPayloadError): string {
  switch (error.code) {
    case "missing_revenue_account":
      return "Chưa cấu hình tài khoản doanh thu. Vui lòng kiểm tra COA.";
    case "missing_receivable_account":
      return "Chưa cấu hình tài khoản công nợ phải thu (131).";
    case "missing_cash_account":
      return error.cashAccountId
        ? "Tài khoản thanh toán không tồn tại trong danh sách. Vui lòng tải lại."
        : "Vui lòng chọn tài khoản thanh toán cho mỗi dòng.";
    default:
      return "Không xác định được tài khoản kế toán.";
  }
}

/**
 * Validate cart + payment, gọi 2 API (`POST /invoices` → `POST /:id/checkout`),
 * sau đó announce/reset/in. Lỗi backend → toast, không reset state.
 */
export const useCheckoutFinalize = (): UseCheckoutFinalizeResult => {
  const payment = useCheckoutPayment();
  const invoicePrinter = useInvoicePrinter();
  const createMutation = useCreateInvoiceMutation();
  const checkoutMutation = useCheckoutInvoiceMutation();

  const paymentAccountsQuery = usePaymentAccountsQuery();
  const revenueAccountsQuery = useRevenueAccountsQuery();
  const receivableAccountsQuery = useReceivableAccountsQuery();

  const accountById = useMemo<Map<string, AccountRow>>(() => {
    const map = new Map<string, AccountRow>();
    for (const a of paymentAccountsQuery.accounts) map.set(a.id, a);
    return map;
  }, [paymentAccountsQuery.accounts]);

  const revenueAccountId = useMemo(
    () => revenueAccountsQuery.data?.data?.[0]?.id ?? "",
    [revenueAccountsQuery.data],
  );
  const receivableAccountId = useMemo(
    () =>
      pickAccountByCodePrefix(receivableAccountsQuery.data?.data, "131")?.id,
    [receivableAccountsQuery.data],
  );

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

  //  const finalizeCheckoutAndPrint = useCallback(
  //   async (options?: { bypassOversellModal?: boolean }) => {
  //     const sessionState = usePosCheckoutSessionStore.getState();
  //     const selectedCustomer =
  //       usePosCheckoutCustomerStore.getState().selectedCustomer;
  //     const purchaseCart = selectPurchaseCart(sessionState);
  //     const ui = usePosCheckoutUiStore.getState();

  //     const result = validateCheckout({
  //       hasAnyCartLines: selectHasAnyCartLines(sessionState),
  //       debt: payment.debt,
  //       keepChange: payment.keepChange,
  //       selectedCustomer,
  //       purchaseCart,
  //       settlementGrandTotal: payment.settlementGrandTotal,
  //       settlementAbs: payment.settlementAbs,
  //       totalPaid: payment.totalPaid,
  //       changeAmount: payment.changeAmount,
  //       shortageAmount: payment.shortageAmount,
  //     });

  //     if (!result.ok) {
  //       ui.setCartError(result.message);
  //       return;
  //     }
  //     if (
  //       !options?.bypassOversellModal &&
  //       getOversellSaleLines(purchaseCart).length > 0
  //     ) {
  //       ui.openOversell();
  //       return;
  //     }

  //     const checkoutResolve = buildCheckoutInvoiceApiPayload({
  //       paymentLines: payment.paymentLines,
  //       debt: payment.debt,
  //       amountDue: payment.settlementGrandTotal,
  //       revenueAccountId,
  //       receivableAccountId,
  //       accountById,
  //     });

  //   console.log('checkoutResolve::: ', checkoutResolve)
  //   //   if (!checkoutResolve.ok) {
  //   //     toast.error(describeResolveError(checkoutResolve.error));
  //   //     return;
  //   //   }

  //   //   const receiptPayload = buildCheckoutInvoicePayload({
  //   //     printInvoice: payment.printInvoice,
  //   //     cart: computeReceiptLines(sessionState),
  //   //     grandTotal: payment.grandTotal,
  //   //     totalPaid: payment.totalPaid,
  //   //     paymentLines: payment.paymentLines,
  //   //     primaryMethodLabel: payment.primaryMethodLabel,
  //   //     methods: PAYMENT_METHODS,
  //   //     keepChange: payment.keepChange,
  //   //     debt: payment.debt,
  //   //   });

  //   //   const note = usePosCheckoutPaymentStore.getState().note || undefined;
  //   //   const createPayload = buildCreateInvoicePayload({
  //   //     sessionId: sessionState.activeSessionId,
  //   //     cart: purchaseCart,
  //   //     customer: selectedCustomer,
  //   //     note,
  //   //   });

  //   //   try {
  //   //     const created = await createMutation.mutateAsync(createPayload);
  //   //     await checkoutMutation.mutateAsync({
  //   //       id: created.id,
  //   //       body: checkoutResolve.body,
  //   //     });
  //   //   } catch (err) {
  //   //     toast.error(
  //   //       err instanceof Error ? err.message : "Không thu được tiền",
  //   //     );
  //   //     return;
  //   //   }

  //   //   const who = selectedCustomer
  //   //     ? ` cho ${formatCustomerDisplay(selectedCustomer)}`
  //   //     : " (khách lẻ)";
  //   //   ui.setAnnouncement(
  //   //     `Đã ghi nhận thanh toán${who}, ${new Intl.NumberFormat("vi-VN", {
  //   //       style: "currency",
  //   //       currency: "VND",
  //   //       maximumFractionDigits: 0,
  //   //     }).format(payment.settlementGrandTotal)}, ${paymentLabel(payment.primaryMethod)}.`,
  //   //   );
  //   //   usePosCheckoutSessionStore.getState().resetActiveSessionAfterCheckout();
  //   //   resetCheckoutDraftState();
  //   //   await printReceiptIfNeeded(receiptPayload);
  //   },
  //   [
  //     payment.debt,
  //     payment.keepChange,
  //     payment.printInvoice,
  //     payment.grandTotal,
  //     payment.totalPaid,
  //     payment.paymentLines,
  //     payment.primaryMethodLabel,
  //     payment.primaryMethod,
  //     payment.settlementGrandTotal,
  //     payment.settlementAbs,
  //     payment.changeAmount,
  //     payment.shortageAmount,
  //     revenueAccountId,
  //     receivableAccountId,
  //     accountById,
  //     createMutation,
  //     checkoutMutation,
  //     printReceiptIfNeeded,
  //   ],
  // );

  const finalizeCheckoutAndPrint = useCallback(
    async (options?: { bypassOversellModal?: boolean }) => {
      const sessionState = usePosCheckoutSessionStore.getState();
      const selectedCustomer =
        usePosCheckoutCustomerStore.getState().selectedCustomer;
      const purchaseCart = selectPurchaseCart(sessionState);
      const ui = usePosCheckoutUiStore.getState();

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

      if (!result.ok) {
        ui.setCartError(result.message);
        return;
      }
      if (
        !options?.bypassOversellModal &&
        getOversellSaleLines(purchaseCart).length > 0
      ) {
        ui.openOversell();
        return;
      }

      const checkoutResolve = buildCheckoutInvoiceApiPayload({
        paymentLines: payment.paymentLines,
        debt: payment.debt,
        amountDue: payment.settlementGrandTotal,
        revenueAccountId,
        receivableAccountId,
        accountById,
      });

    console.log('checkoutResolve::: ', checkoutResolve)
      if (!checkoutResolve.ok) {
        toast.error(describeResolveError(checkoutResolve.error));
        return;
      }

      const receiptPayload = buildCheckoutInvoicePayload({
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

      const note = usePosCheckoutPaymentStore.getState().note || undefined;
      const createPayload = buildCreateInvoicePayload({
        sessionId: sessionState.activeSessionId,
        cart: purchaseCart,
        customer: selectedCustomer,
        note,
      });

      try {
        const created = await createMutation.mutateAsync(createPayload);
        await checkoutMutation.mutateAsync({
          id: created.id,
          body: checkoutResolve.body,
        });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Không thu được tiền",
        );
        return;
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
      await printReceiptIfNeeded(receiptPayload);
    },
    [
      payment.debt,
      payment.keepChange,
      payment.printInvoice,
      payment.grandTotal,
      payment.totalPaid,
      payment.paymentLines,
      payment.primaryMethodLabel,
      payment.primaryMethod,
      payment.settlementGrandTotal,
      payment.settlementAbs,
      payment.changeAmount,
      payment.shortageAmount,
      revenueAccountId,
      receivableAccountId,
      accountById,
      createMutation,
      checkoutMutation,
      printReceiptIfNeeded,
    ],
  );

  return {
    finalizeCheckoutAndPrint,
    isFinalizing: createMutation.isPending || checkoutMutation.isPending,
  };
};
