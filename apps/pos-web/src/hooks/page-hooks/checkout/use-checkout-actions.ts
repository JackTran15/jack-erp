import { useCallback } from "react";
import { toast } from "sonner";

import { useInvoicePrinter } from "@erp/pos/hooks/page-hooks/checkout/use-invoice-printer";
import {
  useCheckoutInvoiceMutation,
  useCheckoutReturnMutation,
  useCreateExchangeInvoiceMutation,
  useCreateInvoiceMutation,
  useCreateReturnInvoiceMutation,
  useRedeemPointsMutation,
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
import {
  PAYMENT_METHODS,
  PaymentMethodEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  CHECKOUT_ANNOUNCEMENTS,
  CHECKOUT_ERRORS,
  CHECKOUT_RETURN_REASONS,
  CHECKOUT_TOASTS,
} from "@erp/pos/constants/checkout-messages.constant";
import {
  computeReceiptLines,
  selectActiveSession,
  selectCustomerDraft,
  selectEffectivePointsRedeemed,
  selectGrandTotal,
  selectHasAnyCartLines,
  selectPaymentDraft,
  selectPointsDiscountAmount,
  selectPurchaseCart,
  selectReturnCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
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
      return CHECKOUT_ERRORS.MISSING_PAYMENT_ACCOUNT;
    default:
      return CHECKOUT_ERRORS.UNKNOWN_PAYMENT_ACCOUNT;
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
  const redeemPointsMutation = useRedeemPointsMutation();
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
      const selectedCustomer = selectCustomerDraft(sessionState).selectedCustomer;
      const purchaseCart = selectPurchaseCart(sessionState);
      const ui = usePosCheckoutUiStore.getState();
      // Slice payment của tab đang active (snapshot tại thời điểm click F12).
      const p = selectPaymentDraft(sessionState);

      const grandTotal = selectGrandTotal(sessionState);
      const pointsDiscountAmount = selectPointsDiscountAmount(sessionState);
      const pointsToRedeem = selectEffectivePointsRedeemed(sessionState);
      const {
        settlementGrandTotal,
        settlementAbs,
        totalPaid,
        changeAmount,
        shortageAmount,
      } = deriveSettlement({
        grandTotal,
        deposit: p.deposit,
        returnFee: p.returnFee,
        pointsDiscountAmount,
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
          // Áp đổi điểm trên draft TRƯỚC khi checkout — BE validate (thẻ active /
          // balance / giá trị đơn) tại bước này; lỗi 400 bắt ngay để không vào
          // /checkout với số tiền sai. Điểm thực sự bị trừ khi /checkout commit.
          if (pointsToRedeem > 0) {
            await redeemPointsMutation.mutateAsync({
              id: invoiceId,
              points: pointsToRedeem,
            });
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
            toast.error(CHECKOUT_TOASTS.NO_RETURN_LINES);
            return;
          }
          // BE `ReturnInvoiceLineDto.locationId` là `@IsUUID()` bắt buộc — chặn
          // sớm dòng trả thiếu vị trí kho (eligible-returns có thể trả locationId
          // rỗng) để tránh 400 "locationId must be a UUID" khó hiểu cho thu ngân.
          if (returnLines.some((l) => !l.locationId)) {
            toast.error(CHECKOUT_TOASTS.RETURN_LINE_MISSING_LOCATION);
            return;
          }

          const revenueAccountId = pickAccountByCodePrefix(
            revenueQuery.data?.data,
            "511",
          )?.id;
          if (!revenueAccountId) {
            toast.error(CHECKOUT_TOASTS.REVENUE_ACCOUNT_UNAVAILABLE);
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
              toast.error(CHECKOUT_TOASTS.EXCHANGE_NEEDS_ORIGINAL);
              return;
            }
            const created = await createExchangeMutation.mutateAsync(
              buildCreateExchangePayload({
                sessionId: sessionState.posSessionId,
                originalInvoiceId,
                customer: selectedCustomer,
                reason: note ?? CHECKOUT_RETURN_REASONS.EXCHANGE,
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
                reason: note ?? CHECKOUT_RETURN_REASONS.RETURN,
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
              ? CHECKOUT_TOASTS.RETURN_FAILED
              : CHECKOUT_TOASTS.PAYMENT_FAILED,
        );
        return;
      }

      const who = CHECKOUT_ANNOUNCEMENTS.customerSuffix(
        selectedCustomer ? formatCustomerDisplay(selectedCustomer) : null,
      );
      const formatVndAmount = (value: number) =>
        new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
          maximumFractionDigits: 0,
        }).format(value);
      if (isReturnFlow) {
        ui.setAnnouncement(
          CHECKOUT_ANNOUNCEMENTS.returnRecorded(
            who,
            formatVndAmount(Math.abs(settlementGrandTotal)),
          ),
        );
      } else {
        ui.setAnnouncement(
          CHECKOUT_ANNOUNCEMENTS.paymentRecorded(
            who,
            formatVndAmount(settlementGrandTotal),
            paymentLabel(primaryMethod),
          ),
        );
      }
      usePosCheckoutSessionStore.getState().resetActiveSessionAfterCheckout();
      usePosCheckoutUiStore.getState().resetCheckoutUiDraft();
      await printReceiptIfNeeded(receiptPayload);
    },
    [
      createMutation,
      updateMutation,
      checkoutMutation,
      redeemPointsMutation,
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
    if (session.sessions.length > 1) {
      // Đóng tab hiện tại; draft per-tab của nó biến mất theo session.
      session.removeSession(session.activeSessionId);
    } else {
      session.resetActiveSessionAfterCheckout();
    }
    // Đóng mọi dialog + xóa cartError (transient toàn cục, không theo tab).
    ui.resetCheckoutUiDraft();
    ui.setAnnouncement(CHECKOUT_ANNOUNCEMENTS.invoiceCanceled);
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
      redeemPointsMutation.isPending ||
      createReturnMutation.isPending ||
      createExchangeMutation.isPending ||
      checkoutReturnMutation.isPending,
    requestCancelInvoice,
    confirmCancelInvoice,
    confirmOversell,
  };
};
