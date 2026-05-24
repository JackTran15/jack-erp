import {
  CashCountStatus,
  type CashCount,
} from "../../cash-vouchers.types";
import { CashCountStatusEnum, type CashCountRecord } from "./cash-count.types";
import { emptyDenominationLines, syncLineAmounts } from "./cash-count.utils";

export function cashCountToRecord(c: CashCount): CashCountRecord {
  const counted = new Date(c.countedAt);
  const countDate = counted.toISOString().slice(0, 10);
  const denomLines = syncLineAmounts(
    c.denominations?.length
      ? emptyDenominationLines().map((line) => {
          const match = c.denominations!.find((d) => d.denom === line.denomination);
          return {
            ...line,
            quantity: match?.count ?? 0,
          };
        })
      : emptyDenominationLines(),
  );
  const actual = Number(c.actualAmount);
  const book = Number(c.currentBalance ?? c.expectedAmount ?? 0);

  return {
    id: c.id,
    documentNumber: c.documentNumber ?? "",
    countDate,
    inventoryUntilDate: countDate,
    countTime: counted.toISOString().slice(11, 16),
    purpose: c.notes ?? "",
    reference: undefined,
    status:
      c.status === CashCountStatus.POSTED
        ? CashCountStatusEnum.PROCESSED
        : CashCountStatusEnum.UNPROCESSED,
    lines: denomLines,
    participants: [],
    actualAmount: actual,
    bookBalance: book,
    variance: Number(c.variance ?? actual - book),
    conclusion: c.notes ?? "",
  };
}

export function recordToCreateCashCountBody(
  record: Pick<CashCountRecord, "actualAmount" | "lines" | "conclusion">,
  cashAccountId: string,
  countedAtIso: string,
): import("../../cash-vouchers.types").CreateCashCountBody {
  const denominations = record.lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({ denom: l.denomination, count: l.quantity }));
  return {
    cashAccountId,
    countedAt: countedAtIso,
    actualAmount: record.actualAmount,
    notes: record.conclusion || undefined,
    denominations: denominations.length ? denominations : undefined,
  };
}
