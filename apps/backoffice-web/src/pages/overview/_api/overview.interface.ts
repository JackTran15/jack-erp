/** Hình dạng dữ liệu các widget trang Tổng quan đang render. */

// ── Row 1 ──────────────────────────────────────────────────────────────────

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
  /** Chi tiết hiện trong modal khi bấm vào dòng. */
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

export interface DailyActivityData {
  updatedAt: string;
  cards: DailyActivityCardData[];
}

// ── Row 2 ──────────────────────────────────────────────────────────────────

export interface StoreRevenuePoint {
  storeName: string;
  revenue: number;
  cost: number;
  profit: number;
}

export interface RevenueCostProfitData {
  updatedAt: string;
  totals: { revenue: number; cost: number; profit: number };
  byStore: StoreRevenuePoint[];
}

export interface CashFlowPoint {
  label: string;
  cashIn: number;
  cashOut: number;
  diff: number;
}

export interface CashFlowData {
  updatedAt: string;
  totals: { cashIn: number; cashOut: number; diff: number };
  points: CashFlowPoint[];
}

// ── Row 3 phải ─────────────────────────────────────────────────────────────

export interface RevenuePoint {
  label: string;
  revenue: number;
}

export interface RevenueOverTimeData {
  updatedAt: string;
  points: RevenuePoint[];
}

export interface ProductProfitPoint {
  label: string;
  revenue: number;
  cogs: number;
  profit: number;
}

export interface ProductProfitData {
  updatedAt: string;
  totals: { revenue: number; cogs: number; profit: number };
  points: ProductProfitPoint[];
}

export interface RevenueCostProfitPoint {
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}

export interface RevenueCostProfitTimeData {
  updatedAt: string;
  points: RevenueCostProfitPoint[];
  /** Tiêu đề trục X, đổi theo "Thống kê theo". */
  axisTitle: string;
}

// ── Row 3 trái ─────────────────────────────────────────────────────────────

export interface ShareSlice {
  key: string;
  label: string;
  value: number;
  percent: number;
  isOthers?: boolean;
}

export interface ProductShareData {
  updatedAt: string;
  slices: ShareSlice[];
}

export interface TopProductRow {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  revenue: number;
}

export interface TopProductsData {
  updatedAt: string;
  rows: TopProductRow[];
}
