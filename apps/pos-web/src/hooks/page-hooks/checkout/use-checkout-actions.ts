import { useCallback } from "react";
import { toast } from "sonner";

import { useInvoicePrinter } from "@erp/pos/hooks/page-hooks/checkout/use-invoice-printer";
import {
  useCheckoutInvoiceMutation,
  useCheckoutReturnMutation,
  useCreateExchangeInvoiceMutation,
  useCreateInvoiceMutation,
  useCreateReturnInvoiceMutation,
  useUpdateInvoiceMutation,
} from "@erp/pos/hooks/react-query/use-query-invoice";
import {
  pickAccountByCodePrefix,
  useRevenueAccountsQuery,
} from "@erp/pos/hooks/react-query/use-query-account";
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
  buildUpdateInvoicePayload,
} from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import {
  buildCheckoutReturnPayload,
  buildCreateExchangePayload,
  buildCreateReturnPayload,
} from "@erp/pos/lib/page-libs/checkout/returnInvoicePayloadMapper";
import { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";
import type { ResolveCheckoutPayloadError } from "@erp/pos/types/checkout.type";
import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";
import { resetCheckoutDraftState } from "@erp/pos/lib/page-libs/checkout/resetCheckoutDraftState";
import {
  PAYMENT_METHODS,
  PaymentMethodEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  computeReceiptLines,
  selectActiveSession,
  selectGrandTotal,
  selectHasAnyCartLines,
  selectPurchaseCart,
  selectReturnCart,
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
    case "missing_payment_account":
      return "Vui lòng chọn tài khoản thanh toán cho mỗi dòng.";
    default:
      return "Không xác định được tài khoản thanh toán.";
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
  const updateMutation = useUpdateInvoiceMutation();
  const checkoutMutation = useCheckoutInvoiceMutation();
  const createReturnMutation = useCreateReturnInvoiceMutation();
  const createExchangeMutation = useCreateExchangeInvoiceMutation();
  const checkoutReturnMutation = useCheckoutReturnMutation();
  // Đơn trả/đổi bắt buộc gửi `revenueAccountId` (BE chưa tự resolve cho luồng
  // này như SALE). Lấy tài khoản doanh thu đầu tiên (ưu tiên code "511…").
  const revenueQuery = useRevenueAccountsQuery();

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
      const session = selectActiveSession(sessionState);
      const variant = session?.checkoutVariant ?? CheckoutVariantEnum.SALE;
      const isReturnFlow = variant !== CheckoutVariantEnum.SALE;

      try {
        if (!isReturnFlow) {
          // ── SALE ──────────────────────────────────────────────────────────
          const checkoutResolve = buildCheckoutInvoiceApiPayload({
            paymentLines: p.paymentLines,
            debt: p.debt,
          });
          if (!checkoutResolve.ok) {
            toast.error(describeResolveError(checkoutResolve.error));
            return;
          }
          // Tab mở từ một draft đã lưu → PATCH chính draft đó rồi checkout, để
          // hóa đơn đó rời khỏi danh sách lưu tạm. Tab thường → tạo mới.
          const sourceInvoiceId = session?.sourceInvoiceId;
          let invoiceId: string;
          if (sourceInvoiceId) {
            const updated = await updateMutation.mutateAsync({
              id: sourceInvoiceId,
              body: buildUpdateInvoicePayload({
                cart: purchaseCart,
                customer: selectedCustomer,
                note,
              }),
            });
            invoiceId = updated.id;
          } else {
            const created = await createMutation.mutateAsync(
              buildCreateInvoicePayload({
                sessionId: sessionState.posSessionId,
                cart: purchaseCart,
                customer: selectedCustomer,
                note,
              }),
            );
            invoiceId = created.id;
          }
          await checkoutMutation.mutateAsync({
            id: invoiceId,
            body: checkoutResolve.body,
          });
        } else {
          // ── RETURN / EXCHANGE ─────────────────────────────────────────────
          // INVOICE_RETURN: credits + hàng mua mới cùng nằm trong purchaseCart.
          // QUICK_EXCHANGE: hàng trả ở returnCart, hàng mua mới ở purchaseCart.
          const returnLines =
            variant === CheckoutVariantEnum.QUICK_EXCHANGE
              ? selectReturnCart(sessionState)
              : purchaseCart.filter((l) => l.isReturnCredit);
          const newLines =
            variant === CheckoutVariantEnum.QUICK_EXCHANGE
              ? purchaseCart
              : purchaseCart.filter((l) => !l.isReturnCredit);
          const originalInvoiceId = session?.originalInvoiceId;

          if (returnLines.length === 0) {
            toast.error("Chưa có hàng nào để trả.");
            return;
          }

          const revenueAccountId = pickAccountByCodePrefix(
            revenueQuery.data?.data,
            "511",
          )?.id;
          if (!revenueAccountId) {
            toast.error(
              "Chưa lấy được tài khoản doanh thu để hạch toán đổi trả. Vui lòng thử lại.",
            );
            return;
          }

          const returnSubtotal = returnLines.reduce(
            (s, l) => s + l.unitPrice * l.qty,
            0,
          );
          const newSubtotal = newLines.reduce(
            (s, l) => s + l.unitPrice * l.qty,
            0,
          );

          const checkoutResolve = buildCheckoutReturnPayload({
            revenueAccountId,
            returnSubtotal,
            newSubtotal,
            paymentLines: p.paymentLines,
            note,
          });
          if (!checkoutResolve.ok) {
            toast.error(describeResolveError(checkoutResolve.error));
            return;
          }

          let invoiceId: string;
          if (newLines.length > 0) {
            // Đổi hàng (trả + mua mới) → bắt buộc có hóa đơn gốc (BE exchange
            // yêu cầu originalInvoiceId; không có endpoint exchange "nhanh").
            if (!originalInvoiceId) {
              toast.error(
                "Đổi hàng cần chọn từ hóa đơn gốc — đổi trả nhanh chưa hỗ trợ thêm hàng mua mới.",
              );
              return;
            }
            const created = await createExchangeMutation.mutateAsync(
              buildCreateExchangePayload({
                sessionId: sessionState.posSessionId,
                originalInvoiceId,
                customer: selectedCustomer,
                reason: note ?? "Đổi hàng tại POS",
                returnLines,
                newLines,
              }),
            );
            invoiceId = created.id;
          } else {
            const created = await createReturnMutation.mutateAsync(
              buildCreateReturnPayload({
                mode: originalInvoiceId ? "regular" : "quick",
                sessionId: sessionState.posSessionId,
                originalInvoiceId,
                customer: selectedCustomer,
                reason: note ?? "Đổi trả tại POS",
                returnLines,
              }),
            );
            invoiceId = created.id;
          }
          await checkoutReturnMutation.mutateAsync({
            id: invoiceId,
            body: checkoutResolve.body,
          });
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : isReturnFlow
              ? "Không ghi nhận được đổi trả"
              : "Không thu được tiền",
        );
        return;
      }

      const who = selectedCustomer
        ? ` cho ${formatCustomerDisplay(selectedCustomer)}`
        : " (khách lẻ)";
      if (isReturnFlow) {
        ui.setAnnouncement(
          `Đã ghi nhận đổi trả${who}, ${new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency: "VND",
            maximumFractionDigits: 0,
          }).format(Math.abs(settlementGrandTotal))}.`,
        );
      } else {
        ui.setAnnouncement(
          `Đã ghi nhận thanh toán${who}, ${new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency: "VND",
            maximumFractionDigits: 0,
          }).format(settlementGrandTotal)}, ${paymentLabel(primaryMethod)}.`,
        );
      }
      usePosCheckoutSessionStore.getState().resetActiveSessionAfterCheckout();
      resetCheckoutDraftState();
      await printReceiptIfNeeded(receiptPayload);
    },
    [
      createMutation,
      updateMutation,
      checkoutMutation,
      createReturnMutation,
      createExchangeMutation,
      checkoutReturnMutation,
      revenueQuery.data,
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
    isFinalizing:
      createMutation.isPending ||
      updateMutation.isPending ||
      checkoutMutation.isPending ||
      createReturnMutation.isPending ||
      createExchangeMutation.isPending ||
      checkoutReturnMutation.isPending,
    requestCancelInvoice,
    confirmCancelInvoice,
    confirmOversell,
  };
};
