/**
 * Backend report keys of the 3 profit reports (ProfitReportDefinition.key). FE
 * maps its REPORT_TYPE_PROFIT enum values onto these via `backendKey`.
 */
export const PROFIT_REPORT_KEYS = {
  PROFIT_BY_ITEM: 'profit-by-item',
  GROSS_PROFIT_BY_INVOICE: 'gross-profit-by-invoice',
  BUSINESS_RESULTS: 'business-results',
} as const;

export type ProfitReportKey =
  (typeof PROFIT_REPORT_KEYS)[keyof typeof PROFIT_REPORT_KEYS];

export const PROFIT_REPORT_TYPE_LABELS_VI: Record<ProfitReportKey, string> = {
  [PROFIT_REPORT_KEYS.PROFIT_BY_ITEM]: 'Lợi nhuận theo mặt hàng',
  [PROFIT_REPORT_KEYS.GROSS_PROFIT_BY_INVOICE]: 'Báo cáo lợi nhuận gộp theo hoá đơn',
  [PROFIT_REPORT_KEYS.BUSINESS_RESULTS]: 'Kết quả kinh doanh',
};

/**
 * Vietnamese labels for the FIXED profit-report columns. Lives in
 * shared-interfaces (like INVOICE_REPORT_COLUMN_LABELS_VI /
 * DEBT_REPORT_COLUMN_LABELS_VI) so backend source stays English. Some keys are
 * intentionally shared across the 3 reports where the underlying concept is
 * identical (`revenue`, `costOfGoods`, `grossProfit`, `categoryName`).
 */
export const PROFIT_REPORT_COLUMN_LABELS_VI: Record<string, string> = {
  // profit-by-item — item/parent grain
  skuCode: 'Mã SKU',
  itemName: 'Tên hàng hóa',
  unit: 'Đơn vị tính',
  location: 'Vị trí',
  quantity: 'Số lượng bán',
  profitPerUnit: 'Lợi nhuận đơn vị',
  marginOnRevenue: 'Tỷ lệ LN/DT',
  marginOnCost: 'Tỷ lệ LN/GV',

  // profit-by-item — group grain
  categoryCode: 'Mã nhóm hàng hóa',
  categoryName: 'Tên nhóm hàng hóa',

  // Shared — profit-by-item (both grains) + gross-profit-by-invoice
  revenue: 'Doanh thu',
  costOfGoods: 'Giá vốn (GV)',
  grossProfit: 'Lợi nhuận (LN)',

  // gross-profit-by-invoice only
  date: 'Ngày',
  grossGoods: 'Tổng tiền hàng',
  discount: 'Giảm giá',

  // business-results only
  khoanMuc: 'Khoản mục',
  kyTruoc: 'Kỳ trước',
  kyHienTai: 'Kỳ hiện tại',
  thayDoiPercent: 'Thay đổi (%)',
  thayDoiSoTien: 'Thay đổi (Số tiền)',
};

/**
 * Formula / sub-label notation per column. Omitted (no entry) for
 * `profit-by-item` measures — the formula's numbering shifts with the
 * "Thống kê theo" grain (item/parent vs group), so a single static label would
 * be wrong for one of the two column sets (mirrors how `invoice-order-listing`
 * leaves `desc` null when a reused key's formula doesn't apply).
 */
export const PROFIT_REPORT_COLUMN_DESCS: Record<string, string> = {
  // gross-profit-by-invoice — one row per day
  grossGoods: '(1)',
  discount: '(2)',
  revenue: '(3)=(1)-(2)',
  costOfGoods: '(4)',
  grossProfit: '(5)=(3)-(4)',
};

/**
 * Stable English key of one "Khoản mục" (line item) in `business-results`, in
 * display order. Covers only the FIXED lines — 2.2's and 3.2's children (one
 * row per cash-voucher category of the matching direction + 1 "Thu khác"/"Chi
 * khác" row for uncategorized lines) are DYNAMIC (depend on the org's live
 * `cash_voucher_categories`), built at request time by
 * `business-results.aggregator.ts` using the category's real `name` — not
 * part of this static catalog.
 */
export const BUSINESS_RESULTS_LINE_KEYS = {
  SALES_VOLUME: 'salesVolume', // I
  REVENUE: 'revenue', // II
  SALES_REVENUE: 'salesRevenue', // 2.1
  GOODS_REVENUE: 'goodsRevenue', // 2.1.1
  GOODS_SOLD_OUT: 'goodsSoldOut', // 2.1.1.a
  GOODS_RETURNED_IN: 'goodsReturnedIn', // 2.1.1.b
  FEE: 'fee', // 2.1.2
  PROMO: 'promo', // 2.1.3
  PROMO_ON_SALE_OUT: 'promoOnSaleOut', // 2.1.3.a
  PROMO_ON_RETURN_IN: 'promoOnReturnIn', // 2.1.3.b
  OTHER_INCOME: 'otherIncome', // 2.2
  EXPENSE: 'expense', // III
  COGS: 'cogs', // 3.1
  COGS_OUT: 'cogsOut', // 3.1.1
  COGS_RETURNED_IN: 'cogsReturnedIn', // 3.1.2
  OTHER_EXPENSE_GROUP: 'otherExpenseGroup', // 3.2 — dynamic 3.2.{i} rows spliced in right after this one
  COGS_TO_REVENUE_RATIO: 'cogsToRevenueRatio', // 3.3
  OTHER_EXPENSE_TO_REVENUE_RATIO: 'otherExpenseToRevenueRatio', // 3.4
  PROFIT: 'profit', // IV
} as const;

export type BusinessResultsLineKey =
  (typeof BUSINESS_RESULTS_LINE_KEYS)[keyof typeof BUSINESS_RESULTS_LINE_KEYS];

/**
 * "Khoản mục" cell text per line, verbatim from the confirmed reference UI —
 * includes the formula notation as part of the label itself (unlike column
 * `desc`, this text IS the row's displayed content, not a header sub-label).
 */
export const BUSINESS_RESULTS_LINE_LABELS_VI: Record<BusinessResultsLineKey, string> = {
  [BUSINESS_RESULTS_LINE_KEYS.SALES_VOLUME]: 'I. Doanh số bán hàng (2.1.1a+2.1.2-2.1.3a)',
  [BUSINESS_RESULTS_LINE_KEYS.REVENUE]: 'II. Doanh thu (2.1+2.2)',
  [BUSINESS_RESULTS_LINE_KEYS.SALES_REVENUE]: '2.1. Thu từ bán hàng (2.1.1+2.1.2-2.1.3)',
  [BUSINESS_RESULTS_LINE_KEYS.GOODS_REVENUE]: '2.1.1. Tiền hàng (2.1.1a-2.1.1b)',
  [BUSINESS_RESULTS_LINE_KEYS.GOODS_SOLD_OUT]: 'a - Tiền hàng bán ra',
  [BUSINESS_RESULTS_LINE_KEYS.GOODS_RETURNED_IN]: 'b - Tiền hàng trả lại',
  [BUSINESS_RESULTS_LINE_KEYS.FEE]: '2.1.2. Tiền phí',
  [BUSINESS_RESULTS_LINE_KEYS.PROMO]: '2.1.3. Khuyến mại (2.1.3a-2.1.3b)',
  [BUSINESS_RESULTS_LINE_KEYS.PROMO_ON_SALE_OUT]: 'a - Khuyến mại hàng bán ra',
  [BUSINESS_RESULTS_LINE_KEYS.PROMO_ON_RETURN_IN]: 'b - Khuyến mại hàng trả lại',
  [BUSINESS_RESULTS_LINE_KEYS.OTHER_INCOME]: '2.2. Thu khác',
  [BUSINESS_RESULTS_LINE_KEYS.EXPENSE]: 'III. Chi phí (3.1+3.2)',
  [BUSINESS_RESULTS_LINE_KEYS.COGS]: '3.1. Chi phí giá vốn hàng hóa (3.1.1+3.1.2)',
  [BUSINESS_RESULTS_LINE_KEYS.COGS_OUT]: '3.1.1 Xuất kho bán hàng',
  [BUSINESS_RESULTS_LINE_KEYS.COGS_RETURNED_IN]: '3.1.2 Nhập kho hàng trả lại',
  [BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_GROUP]: '3.2. Chi phí khác',
  [BUSINESS_RESULTS_LINE_KEYS.COGS_TO_REVENUE_RATIO]:
    '3.3. Tỷ trọng Chi phí giá vốn/Doanh thu (%) [(3.1/II)*100]',
  [BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_TO_REVENUE_RATIO]:
    '3.4. Tỷ trọng Chi phí khác/Doanh thu (%) [(3.2/II)*100]',
  [BUSINESS_RESULTS_LINE_KEYS.PROFIT]: 'IV. Lợi nhuận (II-III)',
};

/** Indent level (0 = top, deeper = more indented) for rendering the "Khoản mục" tree. */
export const BUSINESS_RESULTS_LINE_INDENT: Record<BusinessResultsLineKey, number> = {
  [BUSINESS_RESULTS_LINE_KEYS.SALES_VOLUME]: 0,
  [BUSINESS_RESULTS_LINE_KEYS.REVENUE]: 0,
  [BUSINESS_RESULTS_LINE_KEYS.SALES_REVENUE]: 1,
  [BUSINESS_RESULTS_LINE_KEYS.GOODS_REVENUE]: 2,
  [BUSINESS_RESULTS_LINE_KEYS.GOODS_SOLD_OUT]: 3,
  [BUSINESS_RESULTS_LINE_KEYS.GOODS_RETURNED_IN]: 3,
  [BUSINESS_RESULTS_LINE_KEYS.FEE]: 2,
  [BUSINESS_RESULTS_LINE_KEYS.PROMO]: 2,
  [BUSINESS_RESULTS_LINE_KEYS.PROMO_ON_SALE_OUT]: 3,
  [BUSINESS_RESULTS_LINE_KEYS.PROMO_ON_RETURN_IN]: 3,
  [BUSINESS_RESULTS_LINE_KEYS.OTHER_INCOME]: 1,
  [BUSINESS_RESULTS_LINE_KEYS.EXPENSE]: 0,
  [BUSINESS_RESULTS_LINE_KEYS.COGS]: 1,
  [BUSINESS_RESULTS_LINE_KEYS.COGS_OUT]: 2,
  [BUSINESS_RESULTS_LINE_KEYS.COGS_RETURNED_IN]: 2,
  [BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_GROUP]: 1,
  [BUSINESS_RESULTS_LINE_KEYS.COGS_TO_REVENUE_RATIO]: 1,
  [BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_TO_REVENUE_RATIO]: 1,
  [BUSINESS_RESULTS_LINE_KEYS.PROFIT]: 0,
};

/** Rows rendered bold (section headers / subtotal-bearing lines), matching the reference UI. */
export const BUSINESS_RESULTS_LINE_BOLD: Record<BusinessResultsLineKey, boolean> = {
  [BUSINESS_RESULTS_LINE_KEYS.SALES_VOLUME]: true,
  [BUSINESS_RESULTS_LINE_KEYS.REVENUE]: true,
  [BUSINESS_RESULTS_LINE_KEYS.SALES_REVENUE]: true,
  [BUSINESS_RESULTS_LINE_KEYS.GOODS_REVENUE]: true,
  [BUSINESS_RESULTS_LINE_KEYS.GOODS_SOLD_OUT]: false,
  [BUSINESS_RESULTS_LINE_KEYS.GOODS_RETURNED_IN]: false,
  [BUSINESS_RESULTS_LINE_KEYS.FEE]: false,
  [BUSINESS_RESULTS_LINE_KEYS.PROMO]: true,
  [BUSINESS_RESULTS_LINE_KEYS.PROMO_ON_SALE_OUT]: false,
  [BUSINESS_RESULTS_LINE_KEYS.PROMO_ON_RETURN_IN]: false,
  [BUSINESS_RESULTS_LINE_KEYS.OTHER_INCOME]: false,
  [BUSINESS_RESULTS_LINE_KEYS.EXPENSE]: true,
  [BUSINESS_RESULTS_LINE_KEYS.COGS]: true,
  [BUSINESS_RESULTS_LINE_KEYS.COGS_OUT]: false,
  [BUSINESS_RESULTS_LINE_KEYS.COGS_RETURNED_IN]: false,
  [BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_GROUP]: false,
  [BUSINESS_RESULTS_LINE_KEYS.COGS_TO_REVENUE_RATIO]: false,
  [BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_TO_REVENUE_RATIO]: false,
  [BUSINESS_RESULTS_LINE_KEYS.PROFIT]: true,
};
