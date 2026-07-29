/**
 * Response contract for the POS daily report summary tab ("Báo cáo theo ngày" →
 * "Tổng hợp"). One aggregated object over the requested time window, scoped by
 * organization + branch. All money values are in VND (raw numbers, unformatted).
 *
 * Consumed by pos-web via the generated api-client. Additive to invoice-report.
 */

/** Revenue (Thu): payment methods + voucher/points payment-equivalents. */
export interface PosDailySummaryRevenue {
  cash: number;
  card: number;
  bankTransfer: number;
  voucher: number;
  points: number;
  total: number;
}

/** Expense (Chi): from posted cash-payment vouchers (phiếu chi). */
export interface PosDailySummaryExpense {
  cash: number;
  bankTransfer: number;
  total: number;
}

/** Debt (Công nợ): new debt recorded (ghi nợ) and debt collected/reduced (giảm nợ). */
export interface PosDailySummaryDebt {
  newDebt: number;
  debtCollected: number;
}

/** Goods sold / returned (Hàng bán / Hàng trả): quantity + monetary value. */
export interface PosDailySummaryGoods {
  quantity: number;
  value: number;
}

/** Other (Khác): document/voucher counts. Some counts are placeholders (0) until defined. */
export interface PosDailySummaryOther {
  totalInvoices: number;
  saleInvoices: number;
  returnInvoices: number;
  exchangeInvoices: number;
  voucherCount: number;
  /** Promo-code count (SL mã ưu đãi) — not yet defined; returns 0. */
  promoCodeCount: number;
  /** Card-receipt count (SL biên lai thanh toán thẻ) — count of card payment lines. */
  cardReceiptCount: number;
}

export interface PosDailySummaryResult {
  revenue: PosDailySummaryRevenue;
  expense: PosDailySummaryExpense;
  /** Net cash flow (Thu − Chi). */
  netCashFlow: number;
  debt: PosDailySummaryDebt;
  goodsSold: PosDailySummaryGoods;
  goodsReturned: PosDailySummaryGoods;
  other: PosDailySummaryOther;
}

/**
 * Drill-down category for "xem chi tiết" on a Tab 1 summary line item
 * (`POST /reports/pos/daily-summary/detail`). Each category's row set sums to
 * the matching {@link PosDailySummaryResult} field.
 */
export enum PosDailySummaryDetailCategory {
  RevenueCash = 'revenue-cash',
  RevenueBankTransfer = 'revenue-bank-transfer',
  RevenuePoints = 'revenue-points',
  ExpenseCash = 'expense-cash',
  ExpenseBankTransfer = 'expense-bank-transfer',
  DebtIncrease = 'debt-increase',
  DebtDecrease = 'debt-decrease',
}

/**
 * One transaction/document line backing a summary total. Fields are optional
 * because each category surfaces a different subset (e.g. only
 * `RevenuePoints` sets `pointsUsed`/`pointsValue`; only bank-transfer
 * categories set `bankAccountName`).
 */
export interface PosDailySummaryDetailRow {
  documentNumber: string;
  /** "Loại chứng từ" — e.g. "Bán hàng" / "Đổi trả" / "Thu nợ" / "Thu khác". Absent for Chi categories. */
  documentType?: string;
  issuedAt: string;
  customerName?: string;
  bankAccountName?: string;
  amount?: number;
  pointsUsed?: number;
  pointsValue?: number;
}

/** Grand totals over every row matching the current filters (unaffected by pagination). */
export interface PosDailySummaryDetailTotals {
  amount: number;
  pointsUsed: number;
  pointsValue: number;
}

export interface PosDailySummaryDetailResult {
  rows: PosDailySummaryDetailRow[];
  total: number;
  totals: PosDailySummaryDetailTotals;
}
