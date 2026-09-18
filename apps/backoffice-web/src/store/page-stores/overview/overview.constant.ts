import { GRANULARITY } from "../../../pages/overview/_lib/granularity";
import type {
  Row2CashFlowState,
  Row2RevenueState,
  Row3LeftState,
  Row3RightState,
} from "./overview.interface";
import { ALL_VALUE } from "./overview.interface";

export const DEFAULT_ROW2_REVENUE: Row2RevenueState = {
  period: "this_month",
};

export const DEFAULT_ROW2_CASH_FLOW: Row2CashFlowState = {
  granularity: GRANULARITY.DAY,
  period: "this_month",
};

export const DEFAULT_ROW3_LEFT: Row3LeftState = {
  reportType: "revenue_share",
  dimension: "product_group",
  categoryId: ALL_VALUE,
  variantId: ALL_VALUE,
  period: "this_month",
  displayMode: "name",
  sortBy: "revenue",
};

export const DEFAULT_ROW3_RIGHT: Row3RightState = {
  reportType: "revenue",
  granularity: GRANULARITY.MONTH,
  period: "this_year",
  productGroupIds: [],
  variantIds: [],
  productIds: [],
};

/** Số dòng của bảng "Hàng hóa bán chạy" (suy từ spec, để hằng số cho dễ đổi). */
export const TOP_PRODUCTS_LIMIT = 10;

/** Số lát pie hiển thị riêng; phần còn lại gom vào "Nhóm khác". */
export const PIE_TOP_N = 3;

export const OTHERS_SLICE_LABEL = "Nhóm khác";
