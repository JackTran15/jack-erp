/**
 * Fetcher của trang Tổng quan — `GET /reports/overview/*`.
 *
 * Backend dựng trên cùng mảnh SQL với báo cáo của app quản lý (mobile), nên số
 * ở đây khớp app cùng kỳ cùng chi nhánh. Phạm vi đi qua `branchIds` tường minh
 * (không qua `X-Branch-Id`): một chi nhánh → `[id]`, chuỗi → vắng = mọi chi
 * nhánh được phân công.
 *
 * Phần CHƯA có dữ liệu ở backend (pending, luôn 0): khách đặt cọc, thu COD,
 * thu hộ, hóa đơn đang xử lý, toàn bộ hóa đơn giao hàng.
 */
import { erpApi, requireErpData } from "../../../lib/erp-api";
import { OTHERS_SLICE_LABEL, PIE_TOP_N } from "../../../store/page-stores/overview/overview.constant";
import {
  ALL_VALUE,
  type DisplayMode,
  type ShareDimension,
  type TopProductsSortBy,
} from "../../../store/page-stores/overview/overview.interface";
import { BREAKDOWN_CONFIG } from "../DailyActivityPanel/_breakdownConfig";
import { GRANULARITY, type Granularity } from "../_lib/granularity";
import { resolveOverviewPeriodRange, type OverviewPeriod } from "../_lib/period";
import { buildTimeBuckets } from "../_lib/timeBuckets";
import type {
  BreakdownItem,
  CashFlowData,
  DailyActivityCardData,
  DailyActivityData,
  DailyActivityRowData,
  ProductProfitData,
  ProductShareData,
  RevenueCostProfitData,
  RevenueCostProfitTimeData,
  RevenueOverTimeData,
  TopProductsData,
} from "./overview.interface";

type Query = Record<string, string | number | string[] | undefined>;

/**
 * Dựng query string với mảng là KHOÁ LẶP (`branchIds=a&branchIds=b`) — đúng
 * luật DTO backend. Axios mặc định ra `branchIds[]=a`, bị whitelist chặn.
 */
function withQuery(path: string, query: Query): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => search.append(key, v));
    else search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

async function get<T>(path: string, query: Query): Promise<T> {
  return requireErpData(await erpApi.GET<T>(withQuery(path, query)));
}

/** `"__all__"` của dropdown → vắng khoá. */
const orUndefined = (value: string): string | undefined =>
  value === ALL_VALUE ? undefined : value;

const nowIso = () => new Date().toISOString();

// ── Mốc thời gian ──────────────────────────────────────────────────────────

/** Mức gộp gửi lên server — quý không có ở server, xin theo tháng rồi gộp tại đây. */
const SERVER_UNIT: Record<Granularity, string> = {
  hour_of_day: "hour",
  day_of_week: "weekday",
  day: "day",
  week: "week",
  month: "month",
  quarter: "month",
  year: "year",
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Khoá mốc server (`'0'..'23'`, `'1'..'7'`, `yyyy-MM-ddT00:00:00`) → khoá
 * của `buildTimeBuckets`. Tuần: server là thứ Hai đầu tuần, client đánh số
 * `Tuần n` bước 7 ngày từ đầu kỳ.
 */
function toBucketKey(bucket: string, granularity: Granularity, from: string): string {
  switch (granularity) {
    case GRANULARITY.HOUR_OF_DAY:
      return `h${Number(bucket)}`;
    case GRANULARITY.DAY_OF_WEEK:
      return `d${Number(bucket) - 1}`;
    case GRANULARITY.DAY:
      return bucket.slice(0, 10);
    case GRANULARITY.WEEK: {
      const start = new Date(`${from}T00:00:00`);
      const at = new Date(`${bucket.slice(0, 10)}T00:00:00`);
      const index = Math.round((at.getTime() - start.getTime()) / (7 * 86_400_000));
      const cursor = new Date(start);
      cursor.setDate(start.getDate() + index * 7);
      return `${cursor.getFullYear()}-w${index + 1}`;
    }
    case GRANULARITY.QUARTER:
      return `${bucket.slice(0, 4)}-q${Math.ceil(Number(bucket.slice(5, 7)) / 3)}`;
    case GRANULARITY.YEAR:
      return bucket.slice(0, 4);
    default:
      return bucket.slice(0, 7);
  }
}

/** Trải điểm thưa của server lên đủ mốc của kỳ; mốc không phát sinh = 0. */
function fillBuckets<P extends { bucket: string }, V extends Record<string, number>>(
  period: OverviewPeriod,
  granularity: Granularity,
  points: P[],
  pick: (point: P) => V,
  zero: V,
): (V & { label: string })[] {
  const { from } = resolveOverviewPeriodRange(period);
  const byKey = new Map<string, V>();
  for (const point of points) {
    const key = toBucketKey(point.bucket, granularity, from);
    const acc = { ...(byKey.get(key) ?? zero) };
    const value = pick(point);
    for (const field of Object.keys(value) as (keyof V)[]) {
      acc[field] = (acc[field] + value[field]) as V[keyof V];
    }
    byKey.set(key, acc);
  }
  return buildTimeBuckets(period, granularity).map((b) => ({
    ...(byKey.get(b.key) ?? zero),
    label: b.label,
  }));
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((acc, row) => acc + pick(row), 0);
}

// ── Row 1: hoạt động trong ngày ────────────────────────────────────────────

interface PaymentSplit {
  cash: number;
  card: number;
  transfer: number;
}

interface DailyActivityResponse {
  cashIn: { sales: PaymentSplit; debt: PaymentSplit; other: PaymentSplit };
  revenue: {
    total: number;
    invoiceCount: number;
    paidAmount: number;
    paidCount: number;
    unpaidAmount: number;
    unpaidCount: number;
  };
  cancelled: { count: number; amount: number };
}

type LineValues = Record<string, { value: number; count?: number }>;

/** Dòng chi tiết theo `BREAKDOWN_CONFIG`; dòng chưa có dữ liệu (pending) = 0. */
function breakdownOf(configKey: string, values: LineValues = {}): BreakdownItem[] {
  const config = BREAKDOWN_CONFIG[configKey]!;
  return config.lines.map((line) => ({
    key: line.key,
    label: line.label,
    danger: line.danger,
    value: values[line.key]?.value ?? 0,
    ...(config.withCount ? { count: values[line.key]?.count ?? 0 } : {}),
  }));
}

const splitValues = (split: PaymentSplit): LineValues => ({
  cash: { value: split.cash },
  transfer: { value: split.transfer },
  card: { value: split.card },
});

const splitTotal = (split: PaymentSplit) => split.cash + split.card + split.transfer;

const ZERO_SPLIT: PaymentSplit = { cash: 0, card: 0, transfer: 0 };

function buildCards(res: DailyActivityResponse): DailyActivityCardData[] {
  const { cashIn, revenue, cancelled } = res;
  // Khách đặt cọc: pending — chưa có luồng đặt cọc ở backend.
  const deposit = ZERO_SPLIT;

  const cashInRows: DailyActivityRowData[] = [
    { key: "sales", label: "Bán hàng", split: cashIn.sales },
    // Thu COD: pending — chưa có giao hàng; dòng này hiện chỉ gồm thu nợ.
    { key: "debt", label: "Thu nợ/Thu COD", split: cashIn.debt },
    { key: "deposit", label: "Khách đặt cọc", split: deposit },
    { key: "other", label: "Thu khác", split: cashIn.other },
  ].map(({ split, ...row }) => ({
    ...row,
    value: splitTotal(split),
    breakdown: breakdownOf(row.key, splitValues(split)),
  }));

  const cashInAll: PaymentSplit = {
    cash: cashIn.sales.cash + cashIn.debt.cash + cashIn.other.cash,
    card: cashIn.sales.card + cashIn.debt.card + cashIn.other.card,
    transfer: cashIn.sales.transfer + cashIn.debt.transfer + cashIn.other.transfer,
  };

  const revenueRows: DailyActivityRowData[] = [
    {
      key: "completed",
      label: "Hóa đơn hoàn thành",
      value: revenue.total,
      count: revenue.invoiceCount,
      breakdown: breakdownOf("completed", {
        collected: { value: revenue.paidAmount },
        receivable: { value: revenue.unpaidAmount },
        // Thu hộ: pending.
      }),
    },
    // Hóa đơn đang xử lý: pending — không có luồng chờ giao/giao hàng, nháp không phải đơn.
    { key: "processing", label: "Hóa đơn đang xử lý", value: 0, count: 0, breakdown: breakdownOf("processing") },
  ];

  const invoiceRows: DailyActivityRowData[] = [
    {
      key: "in_store",
      label: "Tại cửa hàng",
      value: revenue.total,
      count: revenue.invoiceCount,
      // "Đã hủy" hiện riêng, không nằm trong tổng của dòng (tổng đã loại hóa đơn hủy).
      breakdown: breakdownOf("in_store", {
        await_payment: { value: revenue.unpaidAmount, count: revenue.unpaidCount },
        paid: { value: revenue.paidAmount, count: revenue.paidCount },
        cancelled: { value: cancelled.amount, count: cancelled.count },
      }),
    },
    // Giao hàng: pending — chưa có module giao hàng.
    { key: "delivery", label: "Giao hàng", value: 0, count: 0, breakdown: breakdownOf("delivery") },
  ];

  return [
    {
      key: "cash_in",
      title: "Tiền thu trong ngày",
      total: splitTotal(cashInAll),
      totalClickable: true,
      rows: cashInRows,
      breakdown: breakdownOf("cash_in", splitValues(cashInAll)),
    },
    {
      key: "estimated_revenue",
      title: "Doanh thu ước tính",
      total: sumBy(revenueRows, (r) => r.value),
      totalClickable: false,
      rows: revenueRows,
    },
    {
      key: "invoices",
      title: "Hóa đơn",
      total: sumBy(invoiceRows, (r) => r.value),
      totalClickable: false,
      rows: invoiceRows,
    },
  ];
}

/** Khung card toàn số 0 — dựng sẵn layout trong lúc đang tải lần đầu. */
export const DAILY_ACTIVITY_PLACEHOLDER: DailyActivityCardData[] = buildCards({
  cashIn: { sales: ZERO_SPLIT, debt: ZERO_SPLIT, other: ZERO_SPLIT },
  revenue: { total: 0, invoiceCount: 0, paidAmount: 0, paidCount: 0, unpaidAmount: 0, unpaidCount: 0 },
  cancelled: { count: 0, amount: 0 },
});

export async function fetchDailyActivity(
  branchIds: string[] | undefined,
): Promise<DailyActivityData> {
  const { from, to } = resolveOverviewPeriodRange("today");
  const res = await get<DailyActivityResponse>("/reports/overview/daily-activity", {
    from,
    to,
    branchIds,
  });
  return { updatedAt: nowIso(), cards: buildCards(res) };
}

// ── Row 2 ──────────────────────────────────────────────────────────────────

interface RevenueCostProfitResponse {
  totals: { revenue: number; cost: number; profit: number };
  stores: { branchId: string; name: string; revenue: number; cost: number; profit: number }[];
}

export async function fetchRevenueCostProfit(params: {
  branchIds: string[] | undefined;
  period: OverviewPeriod;
}): Promise<RevenueCostProfitData> {
  const res = await get<RevenueCostProfitResponse>("/reports/overview/revenue-cost-profit", {
    ...resolveOverviewPeriodRange(params.period),
    branchIds: params.branchIds,
  });
  return {
    updatedAt: nowIso(),
    totals: res.totals,
    byStore: res.stores.map((s) => ({
      storeName: s.name,
      revenue: s.revenue,
      cost: s.cost,
      profit: s.profit,
    })),
  };
}

interface CashFlowResponse {
  points: { bucket: string; cashIn: number; cashOut: number }[];
}

export async function fetchCashFlow(params: {
  branchIds: string[] | undefined;
  period: OverviewPeriod;
  granularity: Granularity;
}): Promise<CashFlowData> {
  const res = await get<CashFlowResponse>("/reports/overview/cash-flow", {
    ...resolveOverviewPeriodRange(params.period),
    unit: SERVER_UNIT[params.granularity],
    branchIds: params.branchIds,
  });
  const points = fillBuckets(
    params.period,
    params.granularity,
    res.points,
    (p) => ({ cashIn: p.cashIn, cashOut: p.cashOut }),
    { cashIn: 0, cashOut: 0 },
  ).map((p) => ({ ...p, diff: p.cashIn - p.cashOut }));

  const cashIn = sumBy(res.points, (p) => p.cashIn);
  const cashOut = sumBy(res.points, (p) => p.cashOut);
  return { updatedAt: nowIso(), totals: { cashIn, cashOut, diff: cashIn - cashOut }, points };
}

// ── Row 3 phải ─────────────────────────────────────────────────────────────

interface RevenueTimelineResponse {
  points: { bucket: string; revenue: number }[];
}

export async function fetchRevenueOverTime(params: {
  branchIds: string[] | undefined;
  period: OverviewPeriod;
  granularity: Granularity;
}): Promise<RevenueOverTimeData> {
  const res = await get<RevenueTimelineResponse>("/reports/overview/revenue-timeline", {
    ...resolveOverviewPeriodRange(params.period),
    unit: SERVER_UNIT[params.granularity],
    branchIds: params.branchIds,
  });
  return {
    updatedAt: nowIso(),
    points: fillBuckets(params.period, params.granularity, res.points, (p) => ({ revenue: p.revenue }), {
      revenue: 0,
    }),
  };
}

interface ProductProfitResponse {
  points: { bucket: string; revenue: number; cogs: number; profit: number }[];
}

export async function fetchProductProfit(params: {
  branchIds: string[] | undefined;
  period: OverviewPeriod;
  granularity: Granularity;
  /** Rỗng = "Tất cả". */
  productGroupIds: string[];
  variantIds: string[];
  productIds: string[];
}): Promise<ProductProfitData> {
  const res = await get<ProductProfitResponse>("/reports/overview/product-profit", {
    ...resolveOverviewPeriodRange(params.period),
    unit: SERVER_UNIT[params.granularity],
    branchIds: params.branchIds,
    categoryIds: params.productGroupIds,
    // Mẫu mã = `products.id`, hàng hóa = `items.id` — khớp dropdown của modal.
    productIds: params.variantIds,
    itemIds: params.productIds,
  });
  const points = fillBuckets(
    params.period,
    params.granularity,
    res.points,
    (p) => ({ revenue: p.revenue, cogs: p.cogs, profit: p.profit }),
    { revenue: 0, cogs: 0, profit: 0 },
  );
  return {
    updatedAt: nowIso(),
    totals: {
      revenue: sumBy(res.points, (p) => p.revenue),
      cogs: sumBy(res.points, (p) => p.cogs),
      profit: sumBy(res.points, (p) => p.profit),
    },
    points,
  };
}

interface RevenueCostProfitTimelineResponse {
  points: { bucket: string; revenue: number; cost: number; profit: number }[];
}

/**
 * Trục X của widget này khác các widget khác: kỳ luôn là MỘT NĂM (`year_YYYY`)
 * hoặc "3 năm gần nhất", và nhãn là số trần ("1".."12") chứ không phải `MM/YYYY`.
 */
function rcpBuckets(
  period: OverviewPeriod,
  granularity: Granularity,
  now: Date,
): { buckets: { key: string; label: string }[]; axisTitle: string } {
  const year = period.startsWith("year_") ? Number(period.slice(5)) : now.getFullYear();

  if (granularity === GRANULARITY.QUARTER) {
    return {
      buckets: Array.from({ length: 4 }, (_, i) => ({ key: `${year}-q${i + 1}`, label: `Quý ${i + 1}` })),
      axisTitle: "Quý",
    };
  }

  if (granularity === GRANULARITY.YEAR) {
    const current = now.getFullYear();
    return {
      buckets: Array.from({ length: 3 }, (_, i) => {
        const y = current - 2 + i;
        return { key: `${y}`, label: `${y}` };
      }),
      axisTitle: "Năm",
    };
  }

  return {
    buckets: Array.from({ length: 12 }, (_, i) => ({ key: `${year}-${pad(i + 1)}`, label: `${i + 1}` })),
    axisTitle: "Tháng",
  };
}

export async function fetchRevenueCostProfitTime(params: {
  branchIds: string[] | undefined;
  period: OverviewPeriod;
  granularity: Granularity;
}): Promise<RevenueCostProfitTimeData> {
  const now = new Date();
  const { buckets, axisTitle } = rcpBuckets(params.period, params.granularity, now);
  const res = await get<RevenueCostProfitTimelineResponse>(
    "/reports/overview/revenue-cost-profit-timeline",
    { ...resolveOverviewPeriodRange(params.period, now), branchIds: params.branchIds },
  );

  // Server trả ô THÁNG (`yyyy-MM-01T00:00:00`); gộp quý/năm tại đây.
  const keyOf = (bucket: string) =>
    params.granularity === GRANULARITY.QUARTER
      ? `${bucket.slice(0, 4)}-q${Math.ceil(Number(bucket.slice(5, 7)) / 3)}`
      : params.granularity === GRANULARITY.YEAR
        ? bucket.slice(0, 4)
        : bucket.slice(0, 7);

  const byKey = new Map<string, { revenue: number; cost: number }>();
  for (const p of res.points) {
    const acc = byKey.get(keyOf(p.bucket)) ?? { revenue: 0, cost: 0 };
    byKey.set(keyOf(p.bucket), { revenue: acc.revenue + p.revenue, cost: acc.cost + p.cost });
  }

  return {
    updatedAt: nowIso(),
    axisTitle,
    points: buckets.map((b) => {
      const { revenue, cost } = byKey.get(b.key) ?? { revenue: 0, cost: 0 };
      return { label: b.label, revenue, cost, profit: revenue - cost };
    }),
  };
}

// ── Row 3 trái ─────────────────────────────────────────────────────────────

interface SubjectRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  revenue: number;
}

interface SubjectListResponse {
  rows: SubjectRow[];
}

const labelOf = (row: SubjectRow, displayMode: DisplayMode) =>
  displayMode === "sku" && row.code ? row.code : row.name;

export async function fetchProductShare(params: {
  branchIds: string[] | undefined;
  dimension: ShareDimension;
  categoryKey: string;
  variantKey: string;
  displayMode: DisplayMode;
  period: OverviewPeriod;
}): Promise<ProductShareData> {
  const res = await get<SubjectListResponse>("/reports/overview/product-share", {
    ...resolveOverviewPeriodRange(params.period),
    branchIds: params.branchIds,
    dimension: params.dimension,
    categoryId: orUndefined(params.categoryKey),
    // Mẫu mã chỉ có ý nghĩa khi thống kê theo hàng hóa (modal chỉ hiện ở trục đó).
    productId: params.dimension === "product" ? orUndefined(params.variantKey) : undefined,
  });

  // Chỉ lát dương mới vẽ được; gom phần ngoài Top N thành "Nhóm khác".
  const valued = res.rows
    .filter((row) => row.revenue > 0)
    .map((row) => ({ key: row.id, label: labelOf(row, params.displayMode), value: row.revenue }));
  const top = valued.slice(0, PIE_TOP_N);
  const restValue = sumBy(valued.slice(PIE_TOP_N), (e) => e.value);
  const shown = restValue > 0 ? [...top, { key: "others", label: OTHERS_SLICE_LABEL, value: restValue }] : top;
  const total = sumBy(shown, (e) => e.value);

  return {
    updatedAt: nowIso(),
    slices: shown.map((entry) => ({
      ...entry,
      percent: total > 0 ? Math.round((entry.value / total) * 100) : 0,
      isOthers: entry.key === "others",
    })),
  };
}

export async function fetchTopProducts(params: {
  branchIds: string[] | undefined;
  categoryKey: string;
  variantKey: string;
  displayMode: DisplayMode;
  period: OverviewPeriod;
  sortBy: TopProductsSortBy;
  limit: number;
}): Promise<TopProductsData> {
  const res = await get<SubjectListResponse>("/reports/overview/top-products", {
    ...resolveOverviewPeriodRange(params.period),
    branchIds: params.branchIds,
    categoryId: orUndefined(params.categoryKey),
    productId: orUndefined(params.variantKey),
    sortBy: params.sortBy,
    limit: params.limit,
  });
  return {
    updatedAt: nowIso(),
    rows: res.rows.map((row) => ({
      productId: row.id,
      name: labelOf(row, params.displayMode),
      unit: row.unit,
      quantity: row.quantity,
      revenue: row.revenue,
    })),
  };
}
