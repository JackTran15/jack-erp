import type { Granularity } from "../../../pages/overview/_lib/granularity";
import type { OverviewPeriod } from "../../../pages/overview/_lib/period";

/** Loại báo cáo của widget trái row 3. */
export type ProductShareReport = "revenue_share" | "top_products";

/** "Thống kê theo" của modal widget trái row 3. */
export type ShareDimension = "product_group" | "variant" | "product";

/** "Hiển thị" — nhãn dùng tên hàng hóa hay mã SKU. */
export type DisplayMode = "name" | "sku";

/** "Sắp xếp theo" của bảng Hàng hóa bán chạy. */
export type TopProductsSortBy = "revenue" | "quantity";

/** Loại báo cáo của widget phải row 3. */
export type RevenueOverTimeReport =
  | "revenue"
  | "product_profit"
  | "revenue_cost_profit";

/** Sentinel "Tất cả" cho các select một giá trị. */
export const ALL_VALUE = "__all__";

export interface Row2RevenueState {
  period: OverviewPeriod;
}

export interface Row2CashFlowState {
  granularity: Granularity;
  period: OverviewPeriod;
}

export interface Row3LeftState {
  reportType: ProductShareReport;
  dimension: ShareDimension;
  /** Id nhóm hàng hóa, hoặc `ALL_VALUE`. */
  categoryId: string;
  /** Id mẫu mã, hoặc `ALL_VALUE`. */
  variantId: string;
  period: OverviewPeriod;
  displayMode: DisplayMode;
  sortBy: TopProductsSortBy;
}

export interface Row3RightState {
  reportType: RevenueOverTimeReport;
  granularity: Granularity;
  period: OverviewPeriod;
  /** Rỗng = "Tất cả". */
  productGroupIds: string[];
  variantIds: string[];
  productIds: string[];
}

export interface OverviewState {
  row2Revenue: Row2RevenueState;
  row2CashFlow: Row2CashFlowState;
  row3Left: Row3LeftState;
  row3Right: Row3RightState;
  actions: {
    setRow2Revenue: (patch: Partial<Row2RevenueState>) => void;
    setRow2CashFlow: (patch: Partial<Row2CashFlowState>) => void;
    setRow3Left: (patch: Partial<Row3LeftState>) => void;
    setRow3Right: (patch: Partial<Row3RightState>) => void;
  };
}
