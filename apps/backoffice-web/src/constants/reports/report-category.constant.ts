export enum REPORT_CATEGORY {
  SALES = 'sales',
  MULTI_CHANNEL_SALES = 'multi_channel_sales',
  PURCHASES = 'purchases',
  INVENTORY = 'inventory',
  DEBTS = 'debts',
  CASH_FUND = 'cash_fund',
  PROFIT = 'profit',
}

export const REPORT_CATEGORY_LABEL = {
  [REPORT_CATEGORY.SALES]: 'Bán hàng',
  [REPORT_CATEGORY.MULTI_CHANNEL_SALES]: 'Bán hàng đa kênh',
  [REPORT_CATEGORY.PURCHASES]: 'Mua hàng',
  [REPORT_CATEGORY.INVENTORY]: 'Tồn kho',
  [REPORT_CATEGORY.DEBTS]: 'Công nợ',
  [REPORT_CATEGORY.CASH_FUND]: 'Quỹ tiền mặt',
  [REPORT_CATEGORY.PROFIT]: 'Lợi nhuận',
};