/**
 * Response contract for the POS daily report summary tab ("Báo cáo theo ngày" →
 * "Tổng hợp"). One aggregated object over the requested time window, scoped by
 * organization + branch. All money values are in VND (raw numbers, unformatted).
 *
 * Consumed by pos-web via the generated api-client. Additive to invoice-report.
 */

/**
 * Revenue (Thu): how much invoice value was settled in the window, split by the
 * instrument that settled it. Sourced from the invoice domain only — invoice
 * payments by method, voucher promotions, redeemed points, plus debt repayments
 * (`debt_payments`, folded into `cash`/`bankTransfer` by their own method).
 * Manual "Phiếu thu" (`cash_receipts`) are deliberately not included.
 */
export interface PosDailySummaryRevenue {
  cash: number;
  card: number;
  bankTransfer: number;
  /** Value settled with a voucher (`invoice_promotions`, promotionType='voucher'). */
  voucher: number;
  /**
   * Value settled with loyalty points (`invoices.points_discount_amount`).
   * Counted in {@link total} like every other instrument: the customer used it
   * to settle part of the invoice, exactly as a voucher does.
   */
  points: number;
  /** Cash + card + bank transfer + voucher + points. */
  total: number;
}

/**
 * Expense (Chi): every payout in the window, from two non-overlapping sources.
 *
 * 1. Refunds, read off the RETURN/EXCHANGE invoice: `refundedAmount −
 *    offsetAmount`, bucketed by `refundMethod` (CASH → {@link cash}, BANK →
 *    {@link bankTransfer}). STORE_CREDIT and the legacy OFFSET method move no
 *    money and are excluded, as is the offset share that settled the original
 *    debt instead of leaving a fund.
 * 2. Everything else, read off the payout vouchers: posted `cash_payments` →
 *    {@link cash}, posted `bank_payments` → {@link bankTransfer}, both filtered
 *    to `purpose <> REFUND`. This is where an expense, salary, purchase or
 *    supplier payment enters — none of which has a sales invoice behind it.
 *
 * `purpose <> REFUND` is what keeps the two sources disjoint: a REFUND voucher
 * is always auto-issued from an invoice, so source 1 already owns it. Counting
 * it twice is the defect this report started with.
 */
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
  /**
   * Thu − Chi. Not a fund balance: both sides are invoice-sourced, so this does
   * not reconcile 1-1 with Sổ quỹ tiền mặt, which also carries manual vouchers.
   */
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
  /** "Loại chứng từ" — e.g. "Bán hàng" / "Đổi trả" / "Đổi trả, mua thêm" / "Thu nợ". */
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
