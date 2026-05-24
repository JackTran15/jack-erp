import {
  CASH_COUNT_STATUS_LABEL,
  VND_DENOMINATIONS,
} from "./cash-count.constants";
import type {
  CashCountDenominationLine,
  CashCountParticipant,
  CashCountRecord,
} from "./cash-count.types";

export function lineAmount(denomination: number, quantity: number): number {
  return denomination * Math.max(0, quantity);
}

export function syncLineAmounts(
  lines: CashCountDenominationLine[],
): CashCountDenominationLine[] {
  return lines.map((l) => ({
    ...l,
    amount: lineAmount(l.denomination, l.quantity),
  }));
}

export function sumQuantity(lines: CashCountDenominationLine[]): number {
  return lines.reduce((s, l) => s + Math.max(0, l.quantity), 0);
}

export function sumAmount(lines: CashCountDenominationLine[]): number {
  return lines.reduce((s, l) => s + l.amount, 0);
}

export function emptyDenominationLines(): CashCountDenominationLine[] {
  return VND_DENOMINATIONS.map((denomination) => ({
    denomination,
    quantity: 0,
    amount: 0,
    description: "",
  }));
}

/** Mock số dư quỹ theo ngày kiểm kê đến (giai đoạn 1). */
export function mockBookBalanceForDate(inventoryUntilDate: string): number {
  const hash = inventoryUntilDate.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return 3_300_000 + (hash % 5) * 100_000;
}

export function computeTotals(
  lines: CashCountDenominationLine[],
  bookBalance: number,
): Pick<CashCountRecord, "actualAmount" | "variance"> {
  const synced = syncLineAmounts(lines);
  const actualAmount = sumAmount(synced);
  return {
    actualAmount,
    variance: actualAmount - bookBalance,
  };
}

export function parseKkqSuffix(documentNumber: string): number {
  const m = documentNumber.match(/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

export function formatKkqNumber(seq: number): string {
  return `KKQ${String(seq).padStart(6, "0")}`;
}

export function nextKkqNumber(records: CashCountRecord[]): string {
  let max = 0;
  for (const r of records) {
    max = Math.max(max, parseKkqSuffix(r.documentNumber));
  }
  return formatKkqNumber(max + 1);
}

export function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nowTimeHm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function emptyParticipant(): CashCountParticipant {
  return { fullName: "", title: "", representative: "" };
}

export function filterCashCountByPeriod(
  records: CashCountRecord[],
  from: string,
  to: string,
): CashCountRecord[] {
  const fromMs = new Date(`${from}T00:00:00`).getTime();
  const toMs = new Date(`${to}T23:59:59`).getTime();
  return records.filter((r) => {
    const t = new Date(`${r.countDate}T12:00:00`).getTime();
    return t >= fromMs && t <= toMs;
  });
}

export function toComparableCashCountText(
  record: CashCountRecord,
  key: string,
): string {
  switch (key) {
    case "countDate":
      return record.countDate;
    case "documentNumber":
      return record.documentNumber;
    case "inventoryUntilDate":
      return record.inventoryUntilDate;
    case "purpose":
      return record.purpose;
    case "statusLabel":
      return CASH_COUNT_STATUS_LABEL[record.status];
    default:
      return "";
  }
}
