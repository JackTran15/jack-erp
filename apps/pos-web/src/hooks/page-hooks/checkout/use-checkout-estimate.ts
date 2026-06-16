import { useCallback, useState } from "react";

import { useInvoicePrinter } from "@erp/pos/hooks/page-hooks/checkout/use-invoice-printer";
import { buildCheckoutInvoicePayload } from "@erp/pos/lib/page-libs/checkout/checkoutReceiptFactory";
import { deriveSettlement } from "@erp/pos/lib/page-libs/checkout/checkoutSettlement";
import {
  PAYMENT_METHODS,
  PaymentMethodEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  CHECKOUT_ANNOUNCEMENTS,
  CHECKOUT_ERRORS,
} from "@erp/pos/constants/checkout-messages.constant";
import {
  computeReceiptLines,
  selectGrandTotal,
  selectHasAnyCartLines,
  selectPaymentDraft,
  selectPointsDiscountAmount,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutEstimateResult {
  /** In bản "HÓA ĐƠN TẠM TÍNH" thuần từ state hiện tại. KHÔNG tạo draft, KHÔNG reset giỏ/tab. */
  printEstimate: () => Promise<void>;
  isPrinting: boolean;
}

/**
 * "In tạm tính": chỉ in xem trước từ state hiện tại — KHÔNG gọi API tạo draft,
 * KHÔNG checkout, KHÔNG reset session/UI (thu ngân còn sửa giỏ trước khi thu
 * tiền chính thức). Đọc state qua `getState()` tại thời điểm bấm (không subscribe
 * payment store reactive).
 */
export function useCheckoutEstimate(): UseCheckoutEstimateResult {
  const invoicePrinter = useInvoicePrinter();
  const [isPrinting, setIsPrinting] = useState(false);

  const printEstimate = useCallback(async () => {
    const sessionState = usePosCheckoutSessionStore.getState();
    const ui = usePosCheckoutUiStore.getState();

    if (!selectHasAnyCartLines(sessionState)) {
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_NOT_FOUND);
      return;
    }

    const p = selectPaymentDraft(sessionState);
    const grandTotal = selectGrandTotal(sessionState);
    const pointsDiscountAmount = selectPointsDiscountAmount(sessionState);
    const { totalPaid, settlementGrandTotal } = deriveSettlement({
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
      settlementTotal: settlementGrandTotal,
      deposit: p.deposit,
      totalPaid,
      paymentLines: p.paymentLines,
      primaryMethodLabel,
      methods: PAYMENT_METHODS,
      keepChange: p.keepChange,
      debt: p.debt,
    });
    if (!receiptPayload) return;

    setIsPrinting(true);
    try {
      await invoicePrinter.print(receiptPayload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Lỗi in hóa đơn tạm tính:", err);
    } finally {
      setIsPrinting(false);
    }
    ui.setAnnouncement(CHECKOUT_ANNOUNCEMENTS.estimatePrinted);
  }, [invoicePrinter]);

  return { printEstimate, isPrinting };
}
