/** Khóa các cột của bảng "Doanh thu theo mặt hàng" (khớp `col` của report BE). */
export enum DailyReportRevenueColumnKey {
  Sku = "sku",
  ItemName = "itemName",
  ItemCategory = "itemCategory",
  Unit = "unit",
  Quantity = "quantity",
  UnitPrice = "unitPrice",
  Goods = "revenue.goods",
  Discount = "revenue.discount",
  Total = "revenue.total",
}

/** Nhãn tiếng Việt cho từng cột (header bảng + modal "Thiết lập cột hiển thị"). */
export const DAILY_REPORT_REVENUE_COLUMN_LABELS: Record<
  DailyReportRevenueColumnKey,
  string
> = {
  [DailyReportRevenueColumnKey.Sku]: "Mã hàng hóa",
  [DailyReportRevenueColumnKey.ItemName]: "Tên hàng hóa",
  [DailyReportRevenueColumnKey.ItemCategory]: "Nhóm hàng hóa",
  [DailyReportRevenueColumnKey.Unit]: "ĐVT",
  [DailyReportRevenueColumnKey.Quantity]: "SL bán",
  [DailyReportRevenueColumnKey.UnitPrice]: "Đơn giá",
  [DailyReportRevenueColumnKey.Goods]: "Tiền hàng",
  [DailyReportRevenueColumnKey.Discount]: "Khuyến mại",
  [DailyReportRevenueColumnKey.Total]: "Doanh thu",
};

/** Thứ tự cột hiển thị mặc định. */
export const DAILY_REPORT_REVENUE_COLUMN_ORDER: DailyReportRevenueColumnKey[] = [
  DailyReportRevenueColumnKey.Sku,
  DailyReportRevenueColumnKey.ItemName,
  DailyReportRevenueColumnKey.ItemCategory,
  DailyReportRevenueColumnKey.Unit,
  DailyReportRevenueColumnKey.Quantity,
  DailyReportRevenueColumnKey.UnitPrice,
  DailyReportRevenueColumnKey.Goods,
  DailyReportRevenueColumnKey.Discount,
  DailyReportRevenueColumnKey.Total,
];

/** Numeric columns are right-aligned, formatted vi-VN, and get a numeric filter operator. */
export const DAILY_REPORT_REVENUE_NUMERIC_COLUMNS: ReadonlySet<DailyReportRevenueColumnKey> =
  new Set([
    DailyReportRevenueColumnKey.Quantity,
    DailyReportRevenueColumnKey.UnitPrice,
    DailyReportRevenueColumnKey.Goods,
    DailyReportRevenueColumnKey.Discount,
    DailyReportRevenueColumnKey.Total,
  ]);

/** Empty text-filter value per column, for the revenue-by-item column filter row. */
export const EMPTY_REVENUE_COLUMN_FILTERS: Record<DailyReportRevenueColumnKey, string> = {
  [DailyReportRevenueColumnKey.Sku]: "",
  [DailyReportRevenueColumnKey.ItemName]: "",
  [DailyReportRevenueColumnKey.ItemCategory]: "",
  [DailyReportRevenueColumnKey.Unit]: "",
  [DailyReportRevenueColumnKey.Quantity]: "",
  [DailyReportRevenueColumnKey.UnitPrice]: "",
  [DailyReportRevenueColumnKey.Goods]: "",
  [DailyReportRevenueColumnKey.Discount]: "",
  [DailyReportRevenueColumnKey.Total]: "",
};

export const DAILY_REPORT_DEFAULT_PAGE_SIZE = 100;

/** Cash denominations (VND) for the "Chi tiết kiểm đếm" modal, high → low. */
export const CASH_DENOMINATIONS = [
  500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000,
] as const;
