import type { DepositLedgerResponse } from "@erp/shared-interfaces";

/**
 * R2 — book vs available balance (TKT-DFR-04). There is no standalone
 * balance endpoint: `bookBalance` / `availableBalance` / `pendingClearingAmount`
 * are already returned as part of `GET /deposit-ledger` (see
 * `DepositLedgerService.getLedger`, `use-deposit-ledger.ts`). This is a typed
 * selector over that response rather than a separate fetch.
 */
export interface DepositBalances {
  bookBalance: number;
  availableBalance: number;
  pendingClearingAmount: number;
}

export function selectDepositBalances(
  ledger: DepositLedgerResponse | undefined,
): DepositBalances | undefined {
  if (!ledger) return undefined;
  return {
    bookBalance: Number(ledger.bookBalance),
    availableBalance: Number(ledger.availableBalance),
    pendingClearingAmount: Number(ledger.pendingClearingAmount),
  };
}
