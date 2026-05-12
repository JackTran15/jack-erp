export enum PurchaseHistoryStatusEnum {
  PAID = "PAID",
  DEBT = "DEBT",
}

export type PurchaseHistoryStatus = PurchaseHistoryStatusEnum;

export enum PurchaseHistoryStatusFilterEnum {
  ALL = "ALL",
  PAID = PurchaseHistoryStatusEnum.PAID,
  DEBT = PurchaseHistoryStatusEnum.DEBT,
}

export type PurchaseHistoryStatusFilter = PurchaseHistoryStatusFilterEnum;

export enum CustomerDetailTabKeyEnum {
  OVERVIEW = "overview",
  INFO = "info",
  HISTORY = "history",
  DEBT = "debt",
}

export type CustomerDetailTabKey = CustomerDetailTabKeyEnum;

export enum DebtTypeFilterEnum {
  ALL = "ALL",
  REDUCE_DEBT_RETURN_INVOICE = "Giảm nợ theo hóa đơn đổi trả",
  SALES_INVOICE_WITH_DEBT = "Hóa đơn bán hàng ghi nợ",
  CASH_RECEIPT = "Phiếu thu tiền mặt",
  COLLECT_DEBT_CASH = "Thu nợ khách hàng bằng tiền mặt",
  STORE_SALES_INVOICE = "Hóa đơn bán hàng tại cửa hàng",
  DEPOSIT_RECEIPT = "Thu tiền gửi",
  COLLECT_DEBT_CARD = "Thu nợ khách hàng bằng thẻ",
}
