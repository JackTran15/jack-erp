import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import {
  pickAccountByCodePrefix,
  usePaymentAccountsQuery,
  useReceivableAccountsQuery,
  useRevenueAccountsQuery,
} from "@erp/pos/hooks/react-query/use-query-account";
import { useInvoicePrinter } from "@erp/pos/hooks/page-hooks/checkout/use-invoice-printer";
import {
  useCheckoutInvoiceMutation,
  useCreateInvoiceMutation,
} from "@erp/pos/hooks/react-query/use-query-invoice";
import type { AccountRow } from "@erp/pos/interfaces/account.interface";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerUtils";
import { buildCheckoutInvoicePayload } from "@erp/pos/lib/page-libs/checkout/checkoutReceiptFactory";
import { deriveSettlement } from "@erp/pos/lib/page-libs/checkout/checkoutSettlement";
import {
  getOversellSaleLines,
  paymentLabel,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { validateCheckout } from "@erp/pos/lib/page-libs/checkout/checkoutValidation";
import {
  buildCheckoutInvoiceApiPayload,
  buildCreateInvoicePayload,
} from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import type { ResolveCheckoutPayloadError } from "@erp/pos/types/checkout.type";
import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";
import { resetCheckoutDraftState } from "@erp/pos/lib/page-libs/checkout/resetCheckoutDraftState";
import {
  PAYMENT_METHODS,
  PaymentMethodEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  computeReceiptLines,
  selectGrandTotal,
  selectHasAnyCartLines,
  selectPurchaseCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutCustomerStore } from "@erp/pos/stores/page-stores/checkout/checkout-customer.store";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutActionsResult {
  finalizeCheckoutAndPrint: (options?: {
    bypassOversellModal?: boolean;
  }) => Promise<void>;
  isFinalizing: boolean;
  /** Mở dialog xác nhận huỷ hoá đơn (return/exchange). */
  requestCancelInvoice: () => void;
  /** Xác nhận huỷ: remove session (nếu >1) hoặc reset session + draft UI. */
  confirmCancelInvoice: () => void;
  /** Người dùng đồng ý "vẫn bán" trên dialog oversell → finalize bỏ qua modal. */
  confirmOversell: () => Promise<void>;
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
 * Terminal actions của checkout: finalize (validate + 2 API + in + reset),
 * cancel-invoice và oversell-confirm. Toàn bộ đọc state qua `getState()` tại
 * thời điểm click + `deriveSettlement` (không subscribe payment store reactive),
 * nên component consume hook này không re-render khi user gõ tiền.
 */
export const useCheckoutActions = (): UseCheckoutActionsResult => {
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

  const finalizeCheckoutAndPrint = useCallback(
    async (options?: { bypassOversellModal?: boolean }) => {
      const sessionState = usePosCheckoutSessionStore.getState();
      const selectedCustomer =
        usePosCheckoutCustomerStore.getState().selectedCustomer;
      const purchaseCart = selectPurchaseCart(sessionState);
      const ui = usePosCheckoutUiStore.getState();
      const p = usePosCheckoutPaymentStore.getState();

      const grandTotal = selectGrandTotal(sessionState);
      const {
        settlementGrandTotal,
        settlementAbs,
        totalPaid,
        changeAmount,
        shortageAmount,
      } = deriveSettlement({
        grandTotal,
        deposit: p.deposit,
        paymentLines: p.paymentLines,
        keepChange: p.keepChange,
        debt: p.debt,
      });
      const primaryMethod = p.paymentLines[0]?.method ?? PaymentMethodEnum.CASH;
      const primaryMethodLabel =
        PAYMENT_METHODS.find((m) => m.value === primaryMethod)?.label ??
        String(primaryMethod);

      const result = validateCheckout({
        hasAnyCartLines: selectHasAnyCartLines(sessionState),
        debt: p.debt,
        keepChange: p.keepChange,
        selectedCustomer,
        purchaseCart,
        settlementGrandTotal,
        settlementAbs,
        totalPaid,
        changeAmount,
        shortageAmount,
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
        paymentLines: p.paymentLines,
        debt: p.debt,
        amountDue: settlementGrandTotal,
        revenueAccountId,
        receivableAccountId,
        accountById,
      });

      if (!checkoutResolve.ok) {
        toast.error(describeResolveError(checkoutResolve.error));
        return;
      }

      const receiptPayload = buildCheckoutInvoicePayload({
        printInvoice: p.printInvoice,
        cart: computeReceiptLines(sessionState),
        grandTotal,
        totalPaid,
        paymentLines: p.paymentLines,
        primaryMethodLabel,
        methods: PAYMENT_METHODS,
        keepChange: p.keepChange,
        debt: p.debt,
      });

      const note = p.note || undefined;
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
        toast.error(err instanceof Error ? err.message : "Không thu được tiền");
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
        }).format(settlementGrandTotal)}, ${paymentLabel(primaryMethod)}.`,
      );
      usePosCheckoutSessionStore.getState().resetActiveSessionAfterCheckout();
      resetCheckoutDraftState();
      await printReceiptIfNeeded(receiptPayload);
    },
    [
      revenueAccountId,
      receivableAccountId,
      accountById,
      createMutation,
      checkoutMutation,
      printReceiptIfNeeded,
    ],
  );

  const requestCancelInvoice = useCallback(() => {
    usePosCheckoutUiStore.getState().openCancelInvoice();
  }, []);

  const confirmCancelInvoice = useCallback(() => {
    const ui = usePosCheckoutUiStore.getState();
    const session = usePosCheckoutSessionStore.getState();
    ui.closeCancelInvoice();
    if (session.sessions.length > 1) {
      session.removeSession(session.activeSessionId);
    } else {
      session.resetActiveSessionAfterCheckout();
      resetCheckoutDraftState();
    }
    ui.setAnnouncement("Đã hủy hóa đơn.");
  }, []);

  const confirmOversell = useCallback(async () => {
    usePosCheckoutUiStore.getState().closeOversell();
    await finalizeCheckoutAndPrint({ bypassOversellModal: true });
  }, [finalizeCheckoutAndPrint]);

  return {
    finalizeCheckoutAndPrint,
    isFinalizing: createMutation.isPending || checkoutMutation.isPending,
    requestCancelInvoice,
    confirmCancelInvoice,
    confirmOversell,
  };
};
