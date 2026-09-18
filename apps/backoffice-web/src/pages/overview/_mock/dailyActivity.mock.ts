import { mockDelay } from "./mockDelay";
import { createRandom, hashSeed, randomInt, randomMoney } from "./seededRandom";

export interface DailyActivityRowData {
  key: string;
  label: string;
  value: number;
  /** Số hóa đơn — chỉ có ở biến thể row hiển thị badge. */
  count?: number;
}

export interface DailyActivityCardData {
  key: string;
  title: string;
  total: number;
  /** Header có thể bấm (có chevron) hay không. */
  totalClickable: boolean;
  rows: DailyActivityRowData[];
}

export interface DailyActivityData {
  updatedAt: string;
  cards: DailyActivityCardData[];
}

const CASH_IN_ROWS = [
  { key: "sales", label: "Bán hàng" },
  { key: "debt", label: "Thu nợ/Thu COD" },
  { key: "deposit", label: "Khách đặt cọc" },
  { key: "other", label: "Thu khác" },
] as const;

const REVENUE_ROWS = [
  { key: "completed", label: "Hóa đơn hoàn thành" },
  { key: "processing", label: "Hóa đơn đang xử lý" },
] as const;

const INVOICE_ROWS = [
  { key: "in_store", label: "Tại cửa hàng" },
  { key: "delivery", label: "Giao hàng" },
] as const;

const sum = (rows: DailyActivityRowData[]) =>
  rows.reduce((acc, row) => acc + row.value, 0);

function buildCards(
  cashInRows: DailyActivityRowData[],
  revenueRows: DailyActivityRowData[],
  invoiceRows: DailyActivityRowData[],
): DailyActivityCardData[] {
  return [
    {
      key: "cash_in",
      title: "Tiền thu trong ngày",
      total: sum(cashInRows),
      totalClickable: true,
      rows: cashInRows,
    },
    {
      key: "estimated_revenue",
      title: "Doanh thu ước tính",
      total: sum(revenueRows),
      totalClickable: false,
      rows: revenueRows,
    },
    {
      key: "invoices",
      title: "Hóa đơn",
      total: sum(invoiceRows),
      totalClickable: false,
      rows: invoiceRows,
    },
  ];
}

/** Khung card toàn số 0 — dựng sẵn layout trong lúc đang tải lần đầu. */
export const DAILY_ACTIVITY_PLACEHOLDER: DailyActivityCardData[] = buildCards(
  CASH_IN_ROWS.map((row) => ({ ...row, value: 0 })),
  REVENUE_ROWS.map((row) => ({ ...row, value: 0, count: 0 })),
  INVOICE_ROWS.map((row) => ({ ...row, value: 0, count: 0 })),
);

/** MOCK — thay bằng API "hoạt động trong ngày" khi backend sẵn sàng. */
export function fetchDailyActivity(scopeKey: string): Promise<DailyActivityData> {
  const today = new Date();
  const dayKey = today.toISOString().slice(0, 10);
  const random = createRandom(hashSeed("daily-activity", scopeKey, dayKey));

  const cashInRows: DailyActivityRowData[] = CASH_IN_ROWS.map((row) => ({
    ...row,
    value: randomMoney(random, 0, 12_000_000),
  }));

  const revenueRows: DailyActivityRowData[] = REVENUE_ROWS.map((row) => ({
    ...row,
    value: randomMoney(random, 0, 20_000_000),
    count: randomInt(random, 0, 24),
  }));

  const invoiceRows: DailyActivityRowData[] = INVOICE_ROWS.map((row) => ({
    ...row,
    value: randomMoney(random, 0, 15_000_000),
    count: randomInt(random, 0, 18),
  }));

  return mockDelay({
    updatedAt: today.toISOString(),
    cards: buildCards(cashInRows, revenueRows, invoiceRows),
  });
}
