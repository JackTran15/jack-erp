/** Settlement magnitude (VND) — refund uses |grandTotal|, sale uses max(0, grandTotal). */
export function settlementAbsFromGrand(grandTotal: number): number {
  return grandTotal < 0 ? -grandTotal : Math.max(0, grandTotal);
}

export function rawPaymentDeltas(
  totalPaid: number,
  settlementAbs: number,
): { rawOver: number; rawUnder: number } {
  return {
    rawOver: Math.max(0, totalPaid - settlementAbs),
    rawUnder: Math.max(0, settlementAbs - totalPaid),
  };
}

export interface DerivedPaymentDisplay {
  changeAmount: number;
  shortageAmount: number;
  debtAmount: number;
}

/**
 * Panel-facing amounts. When `debt` is on, keep-change / forgive are ignored
 * (UI hidden); residual goes to `debtAmount` only.
 */
export function derivePaymentDisplay(input: {
  grandTotal: number;
  totalPaid: number;
  keepChange: boolean;
  debt: boolean;
}): DerivedPaymentDisplay {
  const isRefund = input.grandTotal < 0;
  const settlementAbs = settlementAbsFromGrand(input.grandTotal);
  const { rawOver, rawUnder } = rawPaymentDeltas(input.totalPaid, settlementAbs);
  const applyKeep = input.keepChange && !input.debt;

  if (input.debt && (rawOver > 0 || rawUnder > 0)) {
    return {
      changeAmount: 0,
      shortageAmount: 0,
      debtAmount: rawOver > 0 ? rawOver : rawUnder,
    };
  }

  if (isRefund) {
    return {
      changeAmount: applyKeep ? 0 : rawOver,
      shortageAmount: applyKeep ? 0 : rawUnder,
      debtAmount: 0,
    };
  }

  return {
    changeAmount: rawOver > 0 && !applyKeep ? rawOver : 0,
    shortageAmount: rawUnder > 0 && !applyKeep ? rawUnder : 0,
    debtAmount: 0,
  };
}

export interface SettlementSnapshot {
  /** Net cần tất toán sau khi trừ đặt cọc (âm = hoàn tiền). */
  settlementGrandTotal: number;
  /** Độ lớn tuyệt đối cần thu/chi. */
  settlementAbs: number;
  /** Tổng đã nhập trên các dòng thanh toán. */
  totalPaid: number;
  changeAmount: number;
  shortageAmount: number;
  debtAmount: number;
}

/**
 * Single source of truth cho settlement: gộp `settlementGrandTotal / settlementAbs
 * / totalPaid` + {@link derivePaymentDisplay}. Dùng chung bởi `useCheckoutPayment`,
 * `useCheckoutCollectState`, `useCheckoutActions` — các hook phụ thuộc helper này
 * thay vì phụ thuộc lẫn nhau. `paymentLines` nhận shape tối giản `{ amount }`.
 */
export function deriveSettlement(input: {
  grandTotal: number;
  deposit: number;
  /** Phí đổi trả (return/exchange) — khách trả thêm → tăng số phải thu. */
  returnFee?: number;
  paymentLines: ReadonlyArray<{ amount: number }>;
  keepChange: boolean;
  debt: boolean;
}): SettlementSnapshot {
  const settlementGrandTotal =
    input.grandTotal - input.deposit + (input.returnFee ?? 0);
  const settlementAbs = settlementAbsFromGrand(settlementGrandTotal);
  const totalPaid = input.paymentLines.reduce((sum, l) => sum + l.amount, 0);
  const { changeAmount, shortageAmount, debtAmount } = derivePaymentDisplay({
    grandTotal: settlementGrandTotal,
    totalPaid,
    keepChange: input.keepChange,
    debt: input.debt,
  });
  return {
    settlementGrandTotal,
    settlementAbs,
    totalPaid,
    changeAmount,
    shortageAmount,
    debtAmount,
  };
}

export interface DerivedInvoiceTotals {
  change: number;
  keptChange?: number;
  forgivenShortage?: number;
  debtReduction?: number;
  customerDebtIssued?: number;
}

/**
 * Receipt totals — same debt vs keepChange rules as {@link derivePaymentDisplay}.
 * Refund + debt: cash shortfall vs payout target uses debtReduction, not customerDebtIssued.
 */
export function deriveInvoiceTotals(input: {
  grandTotal: number;
  totalPaid: number;
  keepChange: boolean;
  debt: boolean;
}): DerivedInvoiceTotals {
  const isRefund = input.grandTotal < 0;
  const settlementAbs = settlementAbsFromGrand(input.grandTotal);
  const { rawOver, rawUnder } = rawPaymentDeltas(input.totalPaid, settlementAbs);
  const k = input.keepChange && !input.debt;

  if (input.debt && (rawOver > 0 || rawUnder > 0)) {
    if (isRefund) {
      if (rawUnder > 0) {
        return { change: 0, debtReduction: rawUnder };
      }
      return {
        change: 0,
        ...(rawOver > 0 ? { customerDebtIssued: rawOver } : {}),
      };
    }
    return {
      change: 0,
      ...(rawOver > 0 ? { debtReduction: rawOver } : {}),
      ...(rawUnder > 0 ? { customerDebtIssued: rawUnder } : {}),
    };
  }

  if (isRefund) {
    if (k) {
      const out: DerivedInvoiceTotals = { change: 0 };
      if (rawUnder > 0) out.keptChange = rawUnder;
      else if (rawOver > 0) out.keptChange = rawOver;
      return out;
    }
    return { change: rawUnder };
  }

  if (k) {
    const signed = input.totalPaid - input.grandTotal;
    const out: DerivedInvoiceTotals = { change: 0 };
    if (signed > 0) out.keptChange = signed;
    else if (signed < 0) out.forgivenShortage = -signed;
    return out;
  }

  return { change: input.totalPaid - input.grandTotal };
}
