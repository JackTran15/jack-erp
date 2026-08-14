import { PosDailySummaryDetailCategory } from "@erp/shared-interfaces";

/** Column keys a "xem chi tiết" drill-down row can carry — mirrors `PosDailySummaryDetailRow`. */
export enum DailySummaryDetailColumnKey {
  DocumentNumber = "documentNumber",
  DocumentType = "documentType",
  IssuedAt = "issuedAt",
  CustomerName = "customerName",
  StaffName = "staffName",
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
  /** Neutral default — the two cash categories override it with "NV Thu" / "NV Chi". */
  [DailySummaryDetailColumnKey.StaffName]: "Nhân viên",
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
  /**
   * Per-category header overrides. Needed because one column key can carry two
   * names: the staff on a phiếu thu is "NV Thu", on a phiếu chi "NV Chi", and a
   * flat label map cannot express that.
   */
  columnLabels?: Partial<Record<DailySummaryDetailColumnKey, string>>;
}

const K = DailySummaryDetailColumnKey;

/** Title + visible-column order per drill-down category, keyed off the Tab 1 line item clicked. */
export const DAILY_SUMMARY_DETAIL_CONFIG: Record<PosDailySummaryDetailCategory, DailySummaryDetailConfig> = {
  [PosDailySummaryDetailCategory.RevenueCash]: {
    title: "Tổng tiền mặt",
    columns: [K.DocumentNumber, K.DocumentType, K.IssuedAt, K.CustomerName, K.StaffName, K.Amount],
    columnLabels: { [K.StaffName]: "NV Thu" },
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
    columns: [K.DocumentNumber, K.IssuedAt, K.CustomerName, K.StaffName, K.Amount],
    columnLabels: { [K.StaffName]: "NV Chi" },
  },
  [PosDailySummaryDetailCategory.ExpenseBankTransfer]: {
    title: "Tổng chi chuyển khoản",
    columns: [K.DocumentNumber, K.IssuedAt, K.CustomerName, K.BankAccountName, K.Amount],
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
 * `get-pos-daily-summary-detail.handler.ts` assigns: `invoiceTypeLabel()` for
 * invoice rows, `receiptTypeLabel()` for phiếu thu rows. Categories with no Loại
 * chứng từ column (Chi Tiền mặt/Chuyển khoản) are absent.
 *
 * Filtering is server-side and compares these strings verbatim, so a value here
 * that differs from the handler by even one diacritic silently matches nothing.
 * Change both sides together.
 */
export const DAILY_SUMMARY_DETAIL_DOCUMENT_TYPES: Partial<Record<PosDailySummaryDetailCategory, string[]>> = {
  [PosDailySummaryDetailCategory.RevenueCash]: [
    "Bán hàng",
    "Đổi trả",
    "Đổi trả, mua thêm",
    // Left in deliberately even though the receipts-only source can never emit it:
    // no phiếu thu means money leaving. Removing it is a separate call (A-08).
    "Hoàn tiền mặt",
    "Thu nợ",
    "Huỷ trả hàng",
    "Thu khác",
  ],
  [PosDailySummaryDetailCategory.RevenueBankTransfer]: [
    "Bán hàng",
    "Đổi trả",
    "Đổi trả, mua thêm",
    "Thu nợ",
    "Thu khác",
  ],
  [PosDailySummaryDetailCategory.RevenuePoints]: ["Bán hàng", "Đổi trả", "Đổi trả, mua thêm"],
  [PosDailySummaryDetailCategory.DebtIncrease]: ["Bán hàng", "Đổi trả", "Đổi trả, mua thêm"],
  [PosDailySummaryDetailCategory.DebtDecrease]: ["Bán hàng", "Đổi trả", "Đổi trả, mua thêm"],
};
