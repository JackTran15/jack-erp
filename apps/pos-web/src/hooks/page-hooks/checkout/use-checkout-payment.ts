import { useCallback, useMemo } from "react";
import {
  type PaymentLine,
} from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import type { CashSuggestion } from "@erp/pos/interfaces/checkout.interface";
import {
  PAYMENT_METHODS,
  PaymentMethodEnum,
} from "@erp/pos/constants/checkout.constant";
import { CHECKOUT_ERRORS } from "@erp/pos/constants/checkout-messages.constant";
import { buildSuggestions } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { deriveSettlement } from "@erp/pos/lib/page-libs/checkout/checkoutSettlement";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import { useCheckoutGrandTotal } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-grand-total";
import {
  selectPaymentDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

type Updater<T> = T | ((prev: T) => T);

const apply = <T>(prev: T, value: Updater<T>): T =>
  typeof value === "function" ? (value as (p: T) => T)(prev) : value;

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
  /** Tự điền số tiền dòng đầu = `amount` khi còn ở chế độ auto (1 dòng). */
  setFirstLineAmountAuto: (amount: number) => void;
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

  // Slice payment của tab đang active (reference ổn định theo session).
  const payment = usePosCheckoutSessionStore(selectPaymentDraft);
  const {
    paymentLines,
    keepChange,
    debt,
    note,
    printInvoice,
    preorder,
    selectedSuggestionId,
    deposit,
  } = payment;

  // Action generic + behavior action lấy từ session store (reference ổn định).
  const updateDraftSlice = usePosCheckoutSessionStore(
    (s) => s.updateActiveDraftSlice,
  );
  const handleChangePaymentLines = usePosCheckoutSessionStore(
    (s) => s.handleChangePaymentLines,
  );
  const handlePickSuggestion = usePosCheckoutSessionStore(
    (s) => s.handlePickSuggestion,
  );
  const setFirstLineAmountAuto = usePosCheckoutSessionStore(
    (s) => s.setFirstLineAmountAuto,
  );

  const setPaymentLines = useCallback(
    (value: Updater<PaymentLine[]>) =>
      updateDraftSlice("payment", (p) => ({
        ...p,
        paymentLines: apply(p.paymentLines, value),
      })),
    [updateDraftSlice],
  );
  const setKeepChange = useCallback(
    (value: Updater<boolean>) =>
      updateDraftSlice("payment", (p) => ({
        ...p,
        keepChange: apply(p.keepChange, value),
      })),
    [updateDraftSlice],
  );
  const clearKeepChange = useCallback(
    () => updateDraftSlice("payment", (p) => ({ ...p, keepChange: false })),
    [updateDraftSlice],
  );
  const setDebt = useCallback(
    (value: Updater<boolean>) =>
      updateDraftSlice("payment", (p) => ({
        ...p,
        debt: apply(p.debt, value),
      })),
    [updateDraftSlice],
  );
  const setNote = useCallback(
    (value: Updater<string>) =>
      updateDraftSlice("payment", (p) => ({
        ...p,
        note: apply(p.note, value),
      })),
    [updateDraftSlice],
  );
  const setPrintInvoice = useCallback(
    (value: Updater<boolean>) =>
      updateDraftSlice("payment", (p) => ({
        ...p,
        printInvoice: apply(p.printInvoice, value),
      })),
    [updateDraftSlice],
  );
  const setPreorder = useCallback(
    (value: Updater<boolean>) =>
      updateDraftSlice("payment", (p) => ({
        ...p,
        preorder: apply(p.preorder, value),
      })),
    [updateDraftSlice],
  );
  const setSelectedSuggestionId = useCallback(
    (value: Updater<string | null>) =>
      updateDraftSlice("payment", (p) => ({
        ...p,
        selectedSuggestionId: apply(p.selectedSuggestionId, value),
      })),
    [updateDraftSlice],
  );
  const setDeposit = useCallback(
    (value: Updater<number>) =>
      updateDraftSlice("payment", (p) => ({
        ...p,
        deposit: apply(p.deposit, value),
      })),
    [updateDraftSlice],
  );

  const {
    settlementGrandTotal,
    settlementAbs,
    totalPaid,
    changeAmount,
    shortageAmount,
    debtAmount,
  } = useMemo(
    () =>
      deriveSettlement({ grandTotal, deposit, paymentLines, keepChange, debt }),
    [grandTotal, deposit, paymentLines, keepChange, debt],
  );

  const isRefundFlow = settlementGrandTotal < 0;
  const rawChangeAmount = Math.max(0, totalPaid - settlementAbs);
  const rawShortageAmount = Math.max(0, settlementAbs - totalPaid);
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
          .setCartError(CHECKOUT_ERRORS.CUSTOMER_REQUIRED);
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
    setFirstLineAmountAuto,
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
