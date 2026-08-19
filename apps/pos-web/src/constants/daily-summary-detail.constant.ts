import { PosDailySummaryDetailCategory } from "@erp/shared-interfaces";

/** Column keys a "xem chi tiết" drill-down row can carry — mirrors `PosDailySummaryDetailRow`. */
export enum DailySummaryDetailColumnKey {
  DocumentNumber = "documentNumber",
  DocumentType = "documentType",
  IssuedAt = "issuedAt",
  CustomerName = "customerName",
  BankAccountName = "bankAccountName",
  Amount = "amount",
  PointsUsed = "pointsUsed",
  PointsValue = "pointsValue",
}

export const DAILY_SUMMARY_DETAIL_COLUMN_LABELS: Record<DailySummaryDetailColumnKey, string> = {
  [DailySummaryDetailColumnKey.DocumentNumber]: "Số chứng từ",
  [DailySummaryDetailColumnKey.DocumentType]: "Loại chứng từ",
  [DailySummaryDetailColumnKey.IssuedAt]: "Thời gian",
  [DailySummaryDetailColumnKey.CustomerName]: "Khách hàng",
  [DailySummaryDetailColumnKey.BankAccountName]: "Tài khoản ngân hàng",
  [DailySummaryDetailColumnKey.Amount]: "Số tiền",
  [DailySummaryDetailColumnKey.PointsUsed]: "Điểm sử dụng",
  [DailySummaryDetailColumnKey.PointsValue]: "Giá trị quy đổi",
};

/** Numeric columns — right-aligned, formatted with `formatNumberVi`, numeric filter operator. */
export const DAILY_SUMMARY_DETAIL_NUMERIC_COLUMNS: ReadonlySet<DailySummaryDetailColumnKey> = new Set([
  DailySummaryDetailColumnKey.Amount,
  DailySummaryDetailColumnKey.PointsUsed,
  DailySummaryDetailColumnKey.PointsValue,
]);

export interface DailySummaryDetailConfig {
  title: string;
  columns: DailySummaryDetailColumnKey[];
}

const K = DailySummaryDetailColumnKey;

/** Title + visible-column order per drill-down category, keyed off the Tab 1 line item clicked. */
export const DAILY_SUMMARY_DETAIL_CONFIG: Record<PosDailySummaryDetailCategory, DailySummaryDetailConfig> = {
  [PosDailySummaryDetailCategory.RevenueCash]: {
    title: "Tổng tiền mặt",
    columns: [K.DocumentNumber, K.DocumentType, K.IssuedAt, K.CustomerName, K.Amount],
  },
  [PosDailySummaryDetailCategory.RevenueBankTransfer]: {
    title: "Tổng tiền chuyển khoản",
    columns: [K.DocumentNumber, K.DocumentType, K.IssuedAt, K.CustomerName, K.BankAccountName, K.Amount],
  },
  [PosDailySummaryDetailCategory.RevenuePoints]: {
    title: "Tổng điểm",
    columns: [K.DocumentNumber, K.DocumentType, K.IssuedAt, K.CustomerName, K.PointsUsed, K.PointsValue],
  },
  [PosDailySummaryDetailCategory.ExpenseCash]: {
    title: "Tổng chi tiền mặt",
    columns: [K.DocumentNumber, K.DocumentType, K.IssuedAt, K.CustomerName, K.Amount],
  },
  // Cột Tài khoản ngân hàng chỉ có giá trị ở dòng phiếu chi ngân hàng; dòng hoàn
  // tiền từ hoá đơn để trống vì hoá đơn không lưu tài khoản đã hoàn.
  [PosDailySummaryDetailCategory.ExpenseBankTransfer]: {
    title: "Tổng chi chuyển khoản",
    columns: [K.DocumentNumber, K.DocumentType, K.IssuedAt, K.CustomerName, K.BankAccountName, K.Amount],
  },
  [PosDailySummaryDetailCategory.DebtIncrease]: {
    title: "Tổng ghi nợ",
    columns: [K.DocumentNumber, K.DocumentType, K.IssuedAt, K.CustomerName, K.Amount],
  },
  [PosDailySummaryDetailCategory.DebtDecrease]: {
    title: "Tổng giảm nợ",
    columns: [K.DocumentNumber, K.DocumentType, K.IssuedAt, K.CustomerName, K.Amount],
  },
};

/** Rows per page — sent as `limit` on every request; filtering/paging/totals are computed server-side. */
export const DAILY_SUMMARY_DETAIL_DEFAULT_PAGE_SIZE = 100;

/**
 * "Loại chứng từ" select options per category — fixed lists matching exactly what
 * `get-pos-daily-summary-detail.handler.ts` assigns (see `invoiceTypeLabel()` and
 * the "Thu nợ" label on debt-repayment rows).
 */
export const DAILY_SUMMARY_DETAIL_DOCUMENT_TYPES: Partial<Record<PosDailySummaryDetailCategory, string[]>> = {
  [PosDailySummaryDetailCategory.RevenueCash]: [
    "Bán hàng",
    "Đổi trả",
    "Đổi trả, mua thêm",
    "Thu nợ",
    "Chuyển quỹ",
  ],
  [PosDailySummaryDetailCategory.RevenueBankTransfer]: [
    "Bán hàng",
    "Đổi trả",
    "Đổi trả, mua thêm",
    "Thu nợ",
    "Chuyển quỹ",
  ],
  [PosDailySummaryDetailCategory.RevenuePoints]: ["Bán hàng", "Đổi trả", "Đổi trả, mua thêm"],
  // Chi gồm hoàn tiền từ hoá đơn đổi trả, cộng các phiếu chi không phải hoàn tiền
  // (nhãn theo `purpose`, xem VOUCHER_PURPOSE_LABELS trong detail handler).
  [PosDailySummaryDetailCategory.ExpenseCash]: [
    "Đổi trả",
    "Đổi trả, mua thêm",
    "Trả nợ nhà cung cấp",
    "Mua hàng",
    "Chi phí",
    "Lương",
    "Nộp vào tài khoản",
    "Chuyển chi nhánh",
    "Chi khác",
  ],
  [PosDailySummaryDetailCategory.ExpenseBankTransfer]: [
    "Đổi trả",
    "Đổi trả, mua thêm",
    "Trả nợ nhà cung cấp",
    "Mua hàng",
    "Chi phí",
    "Rút về quỹ tiền mặt",
    "Phí ngân hàng",
    "Chuyển chi nhánh",
    "Chi khác",
  ],
  [PosDailySummaryDetailCategory.DebtIncrease]: ["Bán hàng", "Đổi trả", "Đổi trả, mua thêm"],
  [PosDailySummaryDetailCategory.DebtDecrease]: ["Bán hàng", "Đổi trả", "Đổi trả, mua thêm"],
};
