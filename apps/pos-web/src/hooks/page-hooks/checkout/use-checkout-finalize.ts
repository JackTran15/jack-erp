import { useCallback, type FormEvent } from "react";

import type { PaymentLine } from "@erp/pos/components/page-components/Checkout/Payment/PaymentMethodRow/PaymentMethodRow";
import { useInvoicePrinter } from "@erp/pos/hooks/page-hooks/checkout/use-invoice-printer";
import {
  formatCustomerDisplay,
  type CustomerRow,
} from "@erp/pos/lib/common/customerApi";
import type {
  CartLine,
  PaymentMethodOption,
} from "@erp/pos/lib/page-libs/checkout/checkout.types";
import { buildCheckoutInvoicePayload } from "@erp/pos/lib/page-libs/checkout/checkoutReceiptFactory";
import {
  getOversellSaleLines,
  paymentLabel,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { validateCheckout } from "@erp/pos/lib/page-libs/checkout/checkoutValidation";
import type { InvoicePayload } from "@erp/pos/lib/page-libs/checkout/printing/types";

export interface UseCheckoutFinalizeInput {
  hasAnyCartLines: boolean;
  selectedCustomer: CustomerRow | null;
  purchaseCart: CartLine[];
  receiptLines: CartLine[];
  grandTotal: number;
  settlementGrandTotal: number;
  settlementAbs: number;
  paymentLines: PaymentLine[];
  methods: readonly PaymentMethodOption[];
  totalPaid: number;
  changeAmount: number;
  shortageAmount: number;
  keepChange: boolean;
  debt: boolean;
  primaryMethod: PaymentLine["method"];
  primaryMethodLabel: string;
  printInvoice: boolean;
  announce: (msg: string) => void;
  resetActiveSessionAfterCheckout: () => void;
  onValidationError: (message: string) => void;
  onOversellDetected: () => void;
  onAfterCheckout: () => void;
}

export interface UseCheckoutFinalizeResult {
  finalizeCheckoutAndPrint: (options?: {
    bypassOversellModal?: boolean;
  }) => Promise<void>;
}

export const useCheckoutFinalize = (
  input: UseCheckoutFinalizeInput,
): UseCheckoutFinalizeResult => {
  const {
    hasAnyCartLines,
    selectedCustomer,
    purchaseCart,
    receiptLines,
    grandTotal,
    settlementGrandTotal,
    settlementAbs,
    paymentLines,
    methods,
    totalPaid,
    changeAmount,
    shortageAmount,
    keepChange,
    debt,
    primaryMethod,
    primaryMethodLabel,
    printInvoice,
    announce,
    resetActiveSessionAfterCheckout,
    onValidationError,
    onOversellDetected,
    onAfterCheckout,
  } = input;

  const invoicePrinter = useInvoicePrinter();

  const buildReceiptPayload = useCallback((): InvoicePayload | null => {
    return buildCheckoutInvoicePayload({
      printInvoice,
      cart: receiptLines,
      grandTotal,
      totalPaid,
      paymentLines,
      primaryMethodLabel,
      methods,
      keepChange,
      debt,
    });
  }, [
    printInvoice,
    receiptLines,
    grandTotal,
    totalPaid,
    paymentLines,
    primaryMethodLabel,
    methods,
    keepChange,
    debt,
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
      const result = validateCheckout({
        hasAnyCartLines,
        debt,
        keepChange,
        selectedCustomer,
        purchaseCart,
        settlementGrandTotal,
        settlementAbs,
        totalPaid,
        changeAmount,
        shortageAmount,
      });
      if (!result.ok) {
        onValidationError(result.message);
        return false;
      }
      if (
        !options?.bypassOversellModal &&
        getOversellSaleLines(purchaseCart).length > 0
      ) {
        onOversellDetected();
        return false;
      }
      const who = selectedCustomer
        ? ` cho ${formatCustomerDisplay(selectedCustomer)}`
        : " (khách lẻ)";
      announce(
        `Đã ghi nhận thanh toán${who}, ${new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
          maximumFractionDigits: 0,
        }).format(
          settlementGrandTotal,
        )}, ${paymentLabel(primaryMethod)}.`,
      );
      resetActiveSessionAfterCheckout();
      onAfterCheckout();
      return true;
    },
    [
      announce,
      changeAmount,
      debt,
      keepChange,
      primaryMethod,
      shortageAmount,
      hasAnyCartLines,
      purchaseCart,
      resetActiveSessionAfterCheckout,
      selectedCustomer,
      settlementGrandTotal,
      settlementAbs,
      totalPaid,
      onAfterCheckout,
      onValidationError,
      onOversellDetected,
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
