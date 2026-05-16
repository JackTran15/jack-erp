import { useCallback } from "react";

import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import {
  formatCustomerDisplay,
  type CustomerRow,
} from "@erp/pos/lib/common/customerApi";
import {
  CheckoutVariantEnum,
  type CartLine,
  type DraftInvoice,
  type PaymentMethodOption,
} from "@erp/pos/lib/page-libs/checkout/checkout.types";
import { resolvePaymentMethodLabel } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";

export interface UseCheckoutDraftInput {
  hasAnyCartLines: boolean;
  checkoutVariant: CheckoutVariantEnum;
  grandTotal: number;
  purchaseCart: ReadonlyArray<CartLine>;
  returnCart: ReadonlyArray<CartLine>;
  linesForDraftSingle: ReadonlyArray<CartLine>;
  selectedCustomer: CustomerRow | null;
  paymentLines: ReadonlyArray<PaymentLine>;
  methods: readonly PaymentMethodOption[];
  announce: (msg: string) => void;
  addDraft: (draft: DraftInvoice) => void;
  nextDraftSeq: () => number;
  resetActiveSessionAfterCheckout: () => void;
  onAfterSave: () => void;
}

export interface UseCheckoutDraftResult {
  saveDraft: () => void;
}

export const useCheckoutDraft = (
  input: UseCheckoutDraftInput,
): UseCheckoutDraftResult => {
  const {
    hasAnyCartLines,
    checkoutVariant,
    grandTotal,
    purchaseCart,
    returnCart,
    linesForDraftSingle,
    selectedCustomer,
    paymentLines,
    methods,
    announce,
    addDraft,
    nextDraftSeq,
    resetActiveSessionAfterCheckout,
    onAfterSave,
  } = input;

  const saveDraft = useCallback(() => {
    if (!hasAnyCartLines) return;

    const now = new Date();
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = String(nextDraftSeq()).padStart(4, "0");
    const invoiceNumber = `${yy}${mm}${dd}${seq}`;

    const paymentsSnapshot =
      paymentLines
        .filter((l) => l.amount > 0)
        .map((l) => ({
          method: l.method,
          label: resolvePaymentMethodLabel(l.method, methods),
          amount: l.amount,
        })) ?? [];

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

    addDraft(snapshot);
    announce(`Đã lưu tạm hóa đơn ${invoiceNumber}.`);
    resetActiveSessionAfterCheckout();
    onAfterSave();
  }, [
    addDraft,
    announce,
    checkoutVariant,
    grandTotal,
    hasAnyCartLines,
    linesForDraftSingle,
    methods,
    nextDraftSeq,
    paymentLines,
    purchaseCart,
    returnCart,
    resetActiveSessionAfterCheckout,
    selectedCustomer,
    onAfterSave,
  ]);

  return { saveDraft };
};
