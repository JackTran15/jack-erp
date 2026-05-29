import { useCallback } from "react";
import { toast } from "sonner";

import { useInvoicePrinter } from "@erp/pos/hooks/page-hooks/checkout/use-invoice-printer";
import { useCreateInvoiceMutation } from "@erp/pos/hooks/react-query/use-query-invoice";
import { buildCheckoutInvoicePayload } from "@erp/pos/lib/page-libs/checkout/checkoutReceiptFactory";
import { deriveSettlement } from "@erp/pos/lib/page-libs/checkout/checkoutSettlement";
import { buildCreateInvoicePayload } from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import {
  PAYMENT_METHODS,
  PaymentMethodEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  CHECKOUT_ANNOUNCEMENTS,
  CHECKOUT_ERRORS,
  CHECKOUT_TOASTS,
} from "@erp/pos/constants/checkout-messages.constant";
import {
  computeReceiptLines,
  selectCustomerDraft,
  selectGrandTotal,
  selectHasAnyCartLines,
  selectMetaDraft,
  selectPaymentDraft,
  selectPointsDiscountAmount,
  selectPurchaseCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutEstimateResult {
  /** Tạo invoice draft (KHÔNG checkout) rồi in bản "HÓA ĐƠN TẠM TÍNH". Giữ nguyên giỏ/tab. */
  printEstimate: () => Promise<void>;
  isPrinting: boolean;
}

/**
 * "In tạm tính": gọi `POST /invoices` tạo draft nhưng KHÔNG checkout, in hóa đơn
 * với tiêu đề tạm tính, và KHÔNG reset session/UI (khác hẳn finalize) để thu ngân
 * còn sửa giỏ trước khi thu tiền chính thức. Đọc state qua `getState()` tại thời
 * điểm bấm (không subscribe payment store reactive).
 */
export function useCheckoutEstimate(): UseCheckoutEstimateResult {
  const invoicePrinter = useInvoicePrinter();
  const createMutation = useCreateInvoiceMutation();

  const printEstimate = useCallback(async () => {
    const sessionState = usePosCheckoutSessionStore.getState();
    const ui = usePosCheckoutUiStore.getState();

    if (!selectHasAnyCartLines(sessionState)) {
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_NOT_FOUND);
      return;
    }

    const selectedCustomer = selectCustomerDraft(sessionState).selectedCustomer;
    const selectedSalesperson =
      selectMetaDraft(sessionState).selectedSalesperson;
    const purchaseCart = selectPurchaseCart(sessionState);
    const p = selectPaymentDraft(sessionState);
    const grandTotal = selectGrandTotal(sessionState);
    const pointsDiscountAmount = selectPointsDiscountAmount(sessionState);
    const { totalPaid } = deriveSettlement({
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

    const receiptPayload = buildCheckoutInvoicePayload({
      printInvoice: true,
      provisional: true,
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

    try {
      // Chỉ TẠO draft — KHÔNG redeem điểm, KHÔNG checkout, KHÔNG reset session/UI.
      await createMutation.mutateAsync(
        buildCreateInvoicePayload({
          sessionId: sessionState.posSessionId,
          cart: purchaseCart,
          customer: selectedCustomer,
          note,
          salesperson: selectedSalesperson,
        }),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : CHECKOUT_TOASTS.ESTIMATE_FAILED,
      );
      return;
    }

    if (receiptPayload) {
      try {
        await invoicePrinter.print(receiptPayload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Lỗi in hóa đơn tạm tính:", err);
      }
    }
    ui.setAnnouncement(CHECKOUT_ANNOUNCEMENTS.estimatePrinted);
  }, [createMutation, invoicePrinter]);

  return { printEstimate, isPrinting: createMutation.isPending };
}
