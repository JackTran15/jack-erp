import { useCallback, useMemo } from "react";
import {
  type PaymentLine,
} from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import type { CashSuggestion } from "@erp/pos/lib/page-libs/checkout/checkout.types";
import {
  PAYMENT_METHODS,
  PaymentMethodEnum,
} from "@erp/pos/constants/checkout.constant";
import { buildSuggestions } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import {
  derivePaymentDisplay,
  settlementAbsFromGrand,
} from "@erp/pos/lib/page-libs/checkout/checkoutSettlement";
import type { CustomerRow } from "@erp/pos/lib/common/customerApi";
import { useCheckoutGrandTotal } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-grand-total";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

type Updater<T> = T | ((prev: T) => T);

interface UseCheckoutPaymentResult {
  paymentLines: PaymentLine[];
  setPaymentLines: (value: Updater<PaymentLine[]>) => void;
  keepChange: boolean;
  setKeepChange: (value: Updater<boolean>) => void;
  clearKeepChange: () => void;
  debt: boolean;
  setDebt: (value: Updater<boolean>) => void;
  handleDebtChange: (
    next: boolean,
    selectedCustomer: CustomerRow | null,
  ) => void;
  handleRequireCustomerForDeposit: () => void;
  note: string;
  setNote: (value: Updater<string>) => void;
  printInvoice: boolean;
  setPrintInvoice: (value: Updater<boolean>) => void;
  preorder: boolean;
  setPreorder: (value: Updater<boolean>) => void;
  selectedSuggestionId: string | null;
  setSelectedSuggestionId: (value: Updater<string | null>) => void;
  deposit: number;
  setDeposit: (value: Updater<number>) => void;
  grandTotal: number;
  settlementGrandTotal: number;
  settlementAbs: number;
  totalPaid: number;
  rawChangeAmount: number;
  rawShortageAmount: number;
  changeAmount: number;
  shortageAmount: number;
  isShort: boolean;
  suggestions: CashSuggestion[];
  primaryMethod: PaymentLine["method"];
  primaryMethodLabel: string;
  debtAmount: number;
  handlePickSuggestion: (s: CashSuggestion) => void;
  handleChangePaymentLines: (next: PaymentLine[]) => void;
}

/**
 * Adapter đọc payment store + tính derived. Zero-input — `grandTotal` lấy từ
 * session store (`useCheckoutGrandTotal`), `methods` dùng `PAYMENT_METHODS`
 * const, `onError` ghi vào ui store qua `setCartError`.
 */
export function useCheckoutPayment(): UseCheckoutPaymentResult {
  const grandTotal = useCheckoutGrandTotal();

  const paymentLines = usePosCheckoutPaymentStore((s) => s.paymentLines);
  const keepChange = usePosCheckoutPaymentStore((s) => s.keepChange);
  const debt = usePosCheckoutPaymentStore((s) => s.debt);
  const note = usePosCheckoutPaymentStore((s) => s.note);
  const printInvoice = usePosCheckoutPaymentStore((s) => s.printInvoice);
  const preorder = usePosCheckoutPaymentStore((s) => s.preorder);
  const selectedSuggestionId = usePosCheckoutPaymentStore(
    (s) => s.selectedSuggestionId,
  );
  const deposit = usePosCheckoutPaymentStore((s) => s.deposit);

  const setPaymentLines = usePosCheckoutPaymentStore((s) => s.setPaymentLines);
  const setKeepChange = usePosCheckoutPaymentStore((s) => s.setKeepChange);
  const clearKeepChange = usePosCheckoutPaymentStore(
    (s) => s.clearKeepChange,
  );
  const setDebt = usePosCheckoutPaymentStore((s) => s.setDebt);
  const setNote = usePosCheckoutPaymentStore((s) => s.setNote);
  const setPrintInvoice = usePosCheckoutPaymentStore((s) => s.setPrintInvoice);
  const setPreorder = usePosCheckoutPaymentStore((s) => s.setPreorder);
  const setSelectedSuggestionId = usePosCheckoutPaymentStore(
    (s) => s.setSelectedSuggestionId,
  );
  const setDeposit = usePosCheckoutPaymentStore((s) => s.setDeposit);
  const handleChangePaymentLines = usePosCheckoutPaymentStore(
    (s) => s.handleChangePaymentLines,
  );
  const handlePickSuggestion = usePosCheckoutPaymentStore(
    (s) => s.handlePickSuggestion,
  );

  const settlementGrandTotal = grandTotal - deposit;
  const settlementAbs = settlementAbsFromGrand(settlementGrandTotal);
  const isRefundFlow = settlementGrandTotal < 0;

  const totalPaid = useMemo(
    () => paymentLines.reduce((sum, l) => sum + l.amount, 0),
    [paymentLines],
  );

  const rawChangeAmount = Math.max(0, totalPaid - settlementAbs);
  const rawShortageAmount = Math.max(0, settlementAbs - totalPaid);

  const { changeAmount, shortageAmount, debtAmount } = useMemo(
    () =>
      derivePaymentDisplay({
        grandTotal: settlementGrandTotal,
        totalPaid,
        keepChange,
        debt,
      }),
    [settlementGrandTotal, totalPaid, keepChange, debt],
  );

  const isShort = settlementGrandTotal > 0 && rawShortageAmount > 0;

  const suggestions = useMemo(
    () => buildSuggestions(isRefundFlow ? settlementAbs : settlementGrandTotal),
    [settlementGrandTotal, isRefundFlow, settlementAbs],
  );
  const primaryMethod = paymentLines[0]?.method ?? PaymentMethodEnum.CASH;
  const primaryMethodLabel = useMemo(
    () =>
      PAYMENT_METHODS.find((m) => m.value === primaryMethod)?.label ??
      String(primaryMethod),
    [primaryMethod],
  );

  const handleDebtChange = useCallback(
    (next: boolean, selectedCustomer: CustomerRow | null) => {
      if (next && !selectedCustomer) {
        usePosCheckoutUiStore
          .getState()
          .setCartError("Hóa đơn chưa chọn khách hàng, vui lòng kiểm tra lại.");
        return;
      }
      if (next) {
        setKeepChange(false);
      }
      setDebt(next);
    },
    [setKeepChange, setDebt],
  );

  const handleRequireCustomerForDeposit = useCallback(() => {
    usePosCheckoutUiStore
      .getState()
      .setCartError("Hóa đơn chưa chọn khách hàng, vui lòng kiểm tra lại.");
  }, []);

  return {
    paymentLines,
    setPaymentLines,
    keepChange,
    setKeepChange,
    clearKeepChange,
    debt,
    setDebt,
    handleDebtChange,
    handleRequireCustomerForDeposit,
    note,
    setNote,
    printInvoice,
    setPrintInvoice,
    preorder,
    setPreorder,
    selectedSuggestionId,
    setSelectedSuggestionId,
    deposit,
    setDeposit,
    grandTotal,
    settlementGrandTotal,
    settlementAbs,
    totalPaid,
    rawChangeAmount,
    rawShortageAmount,
    changeAmount,
    shortageAmount,
    isShort,
    suggestions,
    primaryMethod,
    primaryMethodLabel,
    debtAmount,
    handlePickSuggestion,
    handleChangePaymentLines,
  };
}
