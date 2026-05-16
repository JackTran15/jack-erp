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
} from "@erp/pos/lib/checkout/checkout.types";
import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import { buildSuggestions } from "@erp/pos/lib/checkout/checkoutUtils";
import {
  derivePaymentDisplay,
  settlementAbsFromGrand,
} from "@erp/pos/lib/checkout/checkoutSettlement";

interface UseCheckoutPaymentInput {
  grandTotal: number;
  methods: readonly PaymentMethodOption[];
}

interface UseCheckoutPaymentResult {
  paymentLines: PaymentLine[];
  setPaymentLines: Dispatch<SetStateAction<PaymentLine[]>>;
  /**
   * Waive / forgive residual (only when debt is off — debt hides this path).
   */
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

  const settlementAbs = settlementAbsFromGrand(grandTotal);
  const isRefundFlow = grandTotal < 0;

  const rawChangeAmount = Math.max(0, totalPaid - settlementAbs);
  const rawShortageAmount = Math.max(0, settlementAbs - totalPaid);

  const { changeAmount, shortageAmount, debtAmount } = useMemo(
    () =>
      derivePaymentDisplay({
        grandTotal,
        totalPaid,
        keepChange,
        debt,
      }),
    [grandTotal, totalPaid, keepChange, debt],
  );

  const isShort = grandTotal > 0 && rawShortageAmount > 0;

  const suggestions = useMemo(
    () => buildSuggestions(isRefundFlow ? settlementAbs : grandTotal),
    [grandTotal, isRefundFlow, settlementAbs],
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
