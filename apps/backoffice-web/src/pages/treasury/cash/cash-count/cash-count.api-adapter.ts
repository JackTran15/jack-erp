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
            description: match?.description ?? "",
          };
        })
      : emptyDenominationLines(),
  );
  const actual = Number(c.actualAmount);
  // For a POSTED count the book balance is the snapshot taken at post time
  // (expectedAmount); for a DRAFT it is the live cash fund balance
  // (currentBalance) returned by the API.
  const book = Number(
    (c.expectedAmount != null ? c.expectedAmount : c.currentBalance) ?? 0,
  );

  return {
    id: c.id,
    documentNumber: c.documentNumber ?? "",
    countDate,
    inventoryUntilDate: countDate,
    countTime: counted.toISOString().slice(11, 16),
    purpose: c.purpose ?? "",
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
  record: Pick<
    CashCountRecord,
    "actualAmount" | "lines" | "conclusion" | "purpose"| "documentNumber"
  >,
  cashAccountId: string,
  countedAtIso: string,
): import("../../cash-vouchers.types").CreateCashCountBody {
  const denominations = record.lines
    .filter((l) => l.quantity > 0 || (l.description?.trim() ?? "") !== "")
    .map((l) => ({
      denom: l.denomination,
      count: l.quantity,
      description: l.description?.trim() ? l.description.trim() : undefined,
    }));
  return {
    cashAccountId,
    countedAt: countedAtIso,
    actualAmount: record.actualAmount,
    documentNumber: record.documentNumber || undefined,
    purpose: record.purpose || undefined,
    notes: record.conclusion || undefined,
    denominations: denominations.length ? denominations : undefined,
  };
}
