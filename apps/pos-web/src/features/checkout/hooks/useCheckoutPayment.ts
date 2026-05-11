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
} from "../components/payment/PaymentMethodRow";
import type {
  CashSuggestion,
  PaymentMethodOption,
} from "../components/types";
import { PaymentMethodEnum } from "../constants/paymentMethod";
import { buildSuggestions } from "../lib/checkoutUtils";

interface UseCheckoutPaymentInput {
  grandTotal: number;
  methods: readonly PaymentMethodOption[];
}

interface UseCheckoutPaymentResult {
  paymentLines: PaymentLine[];
  setPaymentLines: Dispatch<SetStateAction<PaymentLine[]>>;
  keepChange: boolean;
  setKeepChange: Dispatch<SetStateAction<boolean>>;
  debt: boolean;
  setDebt: Dispatch<SetStateAction<boolean>>;
  note: string;
  setNote: Dispatch<SetStateAction<string>>;
  printInvoice: boolean;
  setPrintInvoice: Dispatch<SetStateAction<boolean>>;
  preorder: boolean;
  setPreorder: Dispatch<SetStateAction<boolean>>;
  selectedSuggestionId: string | null;
  setSelectedSuggestionId: Dispatch<SetStateAction<string | null>>;
  totalPaid: number;
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

  const totalPaid = useMemo(
    () => paymentLines.reduce((sum, l) => sum + l.amount, 0),
    [paymentLines],
  );
  /**
   * Amount to settle in VND (non-negative). For a net refund (grandTotal < 0),
   * this is how much the shop owes the customer.
   */
  const settlementAbs =
    grandTotal < 0 ? -grandTotal : Math.max(0, grandTotal);

  /** Sale: excess cash handed back. Refund: amount still to pay out to customer. */
  const rawChangeAmount =
    grandTotal < 0
      ? Math.max(0, settlementAbs - totalPaid)
      : Math.max(0, totalPaid - settlementAbs);
  const changeAmount = keepChange ? 0 : rawChangeAmount;

  /** Only when customer still owes the shop (positive net). */
  const shortageAmount =
    grandTotal < 0 ? 0 : Math.max(0, settlementAbs - totalPaid);
  const isShort = grandTotal > 0 && totalPaid > 0 && shortageAmount > 0;
  const suggestions = useMemo(
    () => buildSuggestions(grandTotal < 0 ? settlementAbs : grandTotal),
    [grandTotal, settlementAbs],
  );
  const primaryMethod = paymentLines[0]?.method ?? PaymentMethodEnum.CASH;
  const primaryMethodLabel = useMemo(
    () =>
      methods.find((m) => m.value === primaryMethod)?.label ??
      String(primaryMethod),
    [methods, primaryMethod],
  );
  const debtAmount = debt ? shortageAmount : 0;

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

  return {
    paymentLines,
    setPaymentLines,
    keepChange,
    setKeepChange,
    debt,
    setDebt,
    note,
    setNote,
    printInvoice,
    setPrintInvoice,
    preorder,
    setPreorder,
    selectedSuggestionId,
    setSelectedSuggestionId,
    totalPaid,
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
