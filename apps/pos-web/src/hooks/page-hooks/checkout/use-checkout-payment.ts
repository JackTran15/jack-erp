import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createPaymentLine,
  type PaymentLine,
} from "@erp/pos/components/page-components/Checkout/Payment/PaymentMethodRow/PaymentMethodRow";
import type {
  CashSuggestion,
  PaymentMethodOption,
} from "@erp/pos/lib/page-libs/checkout/checkout.types";
import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import { buildSuggestions } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import {
  derivePaymentDisplay,
  settlementAbsFromGrand,
} from "@erp/pos/lib/page-libs/checkout/checkoutSettlement";
import type { CustomerRow } from "@erp/pos/lib/common/customerApi";

interface UseCheckoutPaymentInput {
  /** Raw cart total (BEFORE subtracting deposit). */
  grandTotal: number;
  methods: readonly PaymentMethodOption[];
  /** Surface error messages (e.g. "must pick customer first"). */
  onError: (message: string) => void;
}

interface UseCheckoutPaymentResult {
  paymentLines: PaymentLine[];
  setPaymentLines: Dispatch<SetStateAction<PaymentLine[]>>;
  /**
   * Waive / forgive residual (only when debt is off — debt hides this path).
   */
  keepChange: boolean;
  setKeepChange: Dispatch<SetStateAction<boolean>>;
  /** Stable callback to set keepChange=false (used when customer is picked). */
  clearKeepChange: () => void;
  debt: boolean;
  setDebt: Dispatch<SetStateAction<boolean>>;
  /**
   * Toggle debt. Requires `selectedCustomer` at call time — if missing while
   * enabling, fires `onError` and does NOT update state.
   */
  handleDebtChange: (
    next: boolean,
    selectedCustomer: CustomerRow | null,
  ) => void;
  /** Surface "must select customer" error from the deposit input. */
  handleRequireCustomerForDeposit: () => void;
  note: string;
  setNote: Dispatch<SetStateAction<string>>;
  printInvoice: boolean;
  setPrintInvoice: Dispatch<SetStateAction<boolean>>;
  preorder: boolean;
  setPreorder: Dispatch<SetStateAction<boolean>>;
  selectedSuggestionId: string | null;
  setSelectedSuggestionId: Dispatch<SetStateAction<string | null>>;
  /** Deposit deducted from raw grandTotal to derive settlement. */
  deposit: number;
  setDeposit: Dispatch<SetStateAction<number>>;
  /** `grandTotal - deposit`. Drives all payment math. */
  settlementGrandTotal: number;
  /** `|settlementGrandTotal|`. */
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

export function useCheckoutPayment({
  grandTotal,
  methods,
  onError,
}: UseCheckoutPaymentInput): UseCheckoutPaymentResult {
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>(() => [
    createPaymentLine(PaymentMethodEnum.CASH),
  ]);
  const [keepChange, setKeepChange] = useState(false);
  const [debt, setDebt] = useState(false);
  const [note, setNote] = useState("");
  const [printInvoice, setPrintInvoice] = useState(true);
  const [preorder, setPreorder] = useState(false);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<
    string | null
  >(null);
  const [deposit, setDeposit] = useState(0);

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
      methods.find((m) => m.value === primaryMethod)?.label ??
      String(primaryMethod),
    [methods, primaryMethod],
  );

  const handlePickSuggestion = useCallback((s: CashSuggestion) => {
    setSelectedSuggestionId(s.id);
    setPaymentLines((prev) => {
      const cashIdx = prev.findIndex((l) => l.method === PaymentMethodEnum.CASH);
      if (cashIdx === -1) {
        return [createPaymentLine(PaymentMethodEnum.CASH, s.amount), ...prev];
      }
      return prev.map((l, i) =>
        i === cashIdx ? { ...l, amount: s.amount } : l,
      );
    });
  }, []);

  const handleChangePaymentLines = useCallback((next: PaymentLine[]) => {
    setPaymentLines(next);
    setSelectedSuggestionId(null);
  }, []);

  const clearKeepChange = useCallback(() => {
    setKeepChange(false);
  }, []);

  const handleDebtChange = useCallback(
    (next: boolean, selectedCustomer: CustomerRow | null) => {
      if (next && !selectedCustomer) {
        onError("Hóa đơn chưa chọn khách hàng, vui lòng kiểm tra lại.");
        return;
      }
      if (next) {
        setKeepChange(false);
      }
      setDebt(next);
    },
    [onError],
  );

  const handleRequireCustomerForDeposit = useCallback(() => {
    onError("Hóa đơn chưa chọn khách hàng, vui lòng kiểm tra lại.");
  }, [onError]);

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
