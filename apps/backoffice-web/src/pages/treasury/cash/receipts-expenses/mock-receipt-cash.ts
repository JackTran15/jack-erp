import {
  MOCK_LEDGER_CASH_ROWS,
  parseLedgerPeriodDate,
} from "../../ledger-cash/mock-ledger-cash";
import type { LedgerCashRow } from "../../ledger-cash/ledger-cash.types";
import { isReceiptCashVoucherRow } from "./receipt-cash.utils";

function isWithinPeriod(
  date: Date,
  periodFrom: string,
  periodTo: string,
): boolean {
  const from = parseLedgerPeriodDate(periodFrom);
  const to = parseLedgerPeriodDate(periodTo, true);
  const t = date.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/** Voucher-only rows for Thu, chi tiền mặt (clone to avoid mutating ledger constant). */
export function buildReceiptCashSeedRows(): LedgerCashRow[] {
  return MOCK_LEDGER_CASH_ROWS.filter(isReceiptCashVoucherRow).map((row) =>
    structuredClone(row),
  );
}

export function filterReceiptCashRowsByPeriod(
  rows: LedgerCashRow[],
  periodFrom: string | undefined,
  periodTo: string | undefined,
): LedgerCashRow[] {
  if (!periodFrom || !periodTo) {
    return [...rows].sort(
      (a, b) => a.documentDate.getTime() - b.documentDate.getTime(),
    );
  }
  return rows
    .filter((r) => isWithinPeriod(r.documentDate, periodFrom, periodTo))
    .sort((a, b) => a.documentDate.getTime() - b.documentDate.getTime());
}
