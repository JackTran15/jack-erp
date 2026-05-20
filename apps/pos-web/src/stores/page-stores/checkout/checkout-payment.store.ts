import { create } from "zustand";

import {
  createPaymentLine,
  type PaymentLine,
} from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import type { CashSuggestion } from "@erp/pos/interfaces/checkout.interface";

type Updater<T> = T | ((prev: T) => T);

const apply = <T>(prev: T, value: Updater<T>): T =>
  typeof value === "function" ? (value as (p: T) => T)(prev) : value;

const initialPaymentLines = (): PaymentLine[] => [
  createPaymentLine(PaymentMethodEnum.CASH),
];

interface PosCheckoutPaymentState {
  paymentLines: PaymentLine[];
  keepChange: boolean;
  debt: boolean;
  note: string;
  printInvoice: boolean;
  preorder: boolean;
  selectedSuggestionId: string | null;
  deposit: number;

  setPaymentLines: (value: Updater<PaymentLine[]>) => void;
  setKeepChange: (value: Updater<boolean>) => void;
  clearKeepChange: () => void;
  setDebt: (value: Updater<boolean>) => void;
  setNote: (value: Updater<string>) => void;
  setPrintInvoice: (value: Updater<boolean>) => void;
  setPreorder: (value: Updater<boolean>) => void;
  setSelectedSuggestionId: (value: Updater<string | null>) => void;
  setDeposit: (value: Updater<number>) => void;

  handleChangePaymentLines: (next: PaymentLine[]) => void;
  handlePickSuggestion: (suggestion: CashSuggestion) => void;

  resetPaymentDraft: () => void;
}

export const usePosCheckoutPaymentStore = create<PosCheckoutPaymentState>()(
  (set) => ({
    paymentLines: initialPaymentLines(),
    keepChange: false,
    debt: false,
    note: "",
    printInvoice: true,
    preorder: false,
    selectedSuggestionId: null,
    deposit: 0,

    setPaymentLines: (value) =>
      set((state) => ({ paymentLines: apply(state.paymentLines, value) })),
    setKeepChange: (value) =>
      set((state) => ({ keepChange: apply(state.keepChange, value) })),
    clearKeepChange: () => set({ keepChange: false }),
    setDebt: (value) => set((state) => ({ debt: apply(state.debt, value) })),
    setNote: (value) => set((state) => ({ note: apply(state.note, value) })),
    setPrintInvoice: (value) =>
      set((state) => ({ printInvoice: apply(state.printInvoice, value) })),
    setPreorder: (value) =>
      set((state) => ({ preorder: apply(state.preorder, value) })),
    setSelectedSuggestionId: (value) =>
      set((state) => ({
        selectedSuggestionId: apply(state.selectedSuggestionId, value),
      })),
    setDeposit: (value) =>
      set((state) => ({ deposit: apply(state.deposit, value) })),

    handleChangePaymentLines: (next) =>
      set({ paymentLines: next, selectedSuggestionId: null }),

    handlePickSuggestion: (suggestion) =>
      set((state) => {
        const cashIdx = state.paymentLines.findIndex(
          (l) => l.method === PaymentMethodEnum.CASH,
        );
        const nextLines: PaymentLine[] =
          cashIdx === -1
            ? [
                createPaymentLine(PaymentMethodEnum.CASH, suggestion.amount),
                ...state.paymentLines,
              ]
            : state.paymentLines.map((l, i) =>
                i === cashIdx ? { ...l, amount: suggestion.amount } : l,
              );
        return {
          selectedSuggestionId: suggestion.id,
          paymentLines: nextLines,
        };
      }),

    resetPaymentDraft: () =>
      set({
        paymentLines: initialPaymentLines(),
        keepChange: false,
        debt: false,
        note: "",
        selectedSuggestionId: null,
        deposit: 0,
      }),
  }),
);
