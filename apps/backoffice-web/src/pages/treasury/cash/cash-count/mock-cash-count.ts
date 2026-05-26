import { CashCountStatusEnum } from "./cash-count.types";
import {
  computeTotals,
  emptyDenominationLines,
  mockBookBalanceForDate,
  syncLineAmounts,
} from "./cash-count.utils";

function buildLines(
  quantities: number[],
  descriptions: string[] = [],
): ReturnType<typeof emptyDenominationLines> {
  const base = emptyDenominationLines();
  return syncLineAmounts(
    base.map((l, i) => ({
      ...l,
      quantity: quantities[i] ?? 0,
      description: descriptions[i] ?? "",
    })),
  );
}

const inventoryDate1 = "2026-05-21";
const lines1 = buildLines(
  [10, 5, 8, 4, 2, 2, 1, 1, 0],
  ["", "", "", "", "", "", "", "", ""],
);
const book1 = mockBookBalanceForDate(inventoryDate1);
const totals1 = computeTotals(lines1, book1);

const inventoryDate2 = "2026-05-20";
const lines2 = buildLines([2, 1, 3, 0, 0, 0, 0, 0, 0]);
const book2 = mockBookBalanceForDate(inventoryDate2);
const totals2 = computeTotals(lines2, book2);

export const MOCK_CASH_COUNT_SEED = [
  {
    id: "kkq-2",
    documentNumber: "KKQ000002",
    countDate: "2026-05-21",
    inventoryUntilDate: inventoryDate1,
    countTime: "23:14",
    purpose: "Kiểm kê test",
    reference: "",
    status: CashCountStatusEnum.UNPROCESSED,
    lines: lines1,
    participants: [
      {
        fullName: "Phan Thanh Hà",
        title: "Sales",
        representative: "Tổng ca",
      },
    ],
    bookBalance: book1,
    conclusion: "",
    ...totals1,
  },
  {
    id: "kkq-1",
    documentNumber: "KKQ000001",
    countDate: "2026-05-20",
    inventoryUntilDate: inventoryDate2,
    countTime: "18:00",
    purpose: "Kiểm kê cuối ngày",
    reference: "",
    status: CashCountStatusEnum.PROCESSED,
    lines: lines2,
    participants: [
      {
        fullName: "Nguyễn Văn A",
        title: "Kế toán",
        representative: "Đại diện quỹ",
      },
    ],
    bookBalance: book2,
    conclusion: "Đã xử lý chênh lệch.",
    ...totals2,
  },
];

export function buildCashCountSeedRows(): import("./cash-count.types").CashCountRecord[] {
  return MOCK_CASH_COUNT_SEED.map((r) => ({
    ...r,
    lines: r.lines.map((l) => ({ ...l })),
    participants: r.participants.map((p) => ({ ...p })),
  }));
}
