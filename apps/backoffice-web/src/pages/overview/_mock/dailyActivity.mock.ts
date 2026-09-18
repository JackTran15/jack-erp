import { BREAKDOWN_CONFIG } from "../DailyActivityPanel/_breakdownConfig";
import { mockDelay } from "./mockDelay";
import { createRandom, hashSeed, randomInt, randomMoney } from "./seededRandom";
import { splitTotal } from "./splitTotal";

export interface BreakdownItem {
  key: string;
  label: string;
  value: number;
  count?: number;
  danger?: boolean;
}

export interface DailyActivityRowData {
  key: string;
  label: string;
  value: number;
  /** Số hóa đơn — chỉ có ở biến thể row hiển thị badge. */
  count?: number;
  /** Chi tiết hiện trong modal khi bấm vào dòng. Tổng luôn bằng `value`. */
  breakdown?: BreakdownItem[];
}

export interface DailyActivityCardData {
  key: string;
  title: string;
  total: number;
  /** Header có thể bấm (có chevron) hay không. */
  totalClickable: boolean;
  rows: DailyActivityRowData[];
  /** Chi tiết của header card — chỉ có khi header bấm được. */
  breakdown?: BreakdownItem[];
}

/**
 * Sinh các dòng chi tiết cho một điểm bấm, chia đúng `value` (và `count`) của nó
 * ra theo cấu hình → "Tổng" trong modal luôn khớp số trên row 1.
 */
function buildBreakdown(
  configKey: string,
  value: number,
  count: number | undefined,
  scopeKey: string,
): BreakdownItem[] | undefined {
  const config = BREAKDOWN_CONFIG[configKey];
  if (!config) return undefined;

  const random = createRandom(hashSeed("breakdown", scopeKey, configKey));
  const values = splitTotal(value, config.lines.length, random);
  const counts =
    config.withCount && count !== undefined
      ? splitTotal(count, config.lines.length, random)
      : undefined;

  return config.lines.map((line, i) => ({
    key: line.key,
    label: line.label,
    danger: line.danger,
    value: values[i] ?? 0,
    ...(counts ? { count: counts[i] ?? 0 } : {}),
  }));
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
  scopeKey = "placeholder",
): DailyActivityCardData[] {
  const cashInTotal = sum(cashInRows);
  return [
    {
      key: "cash_in",
      title: "Tiền thu trong ngày",
      total: cashInTotal,
      totalClickable: true,
      rows: cashInRows,
      breakdown: buildBreakdown("cash_in", cashInTotal, undefined, scopeKey),
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

  const withBreakdown = (
    row: { key: string; label: string },
    value: number,
    count?: number,
  ): DailyActivityRowData => ({
    ...row,
    value,
    ...(count === undefined ? {} : { count }),
    breakdown: buildBreakdown(row.key, value, count, scopeKey),
  });

  const cashInRows = CASH_IN_ROWS.map((row) =>
    withBreakdown(row, randomMoney(random, 0, 12_000_000)),
  );

  const revenueRows = REVENUE_ROWS.map((row) =>
    withBreakdown(
      row,
      randomMoney(random, 0, 20_000_000),
      randomInt(random, 0, 24),
    ),
  );

  const invoiceRows = INVOICE_ROWS.map((row) =>
    withBreakdown(
      row,
      randomMoney(random, 0, 15_000_000),
      randomInt(random, 0, 18),
    ),
  );

  return mockDelay({
    updatedAt: today.toISOString(),
    cards: buildCards(cashInRows, revenueRows, invoiceRows, scopeKey),
  });
}
