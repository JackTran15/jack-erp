export enum DocumentType {
  INVOICE = 'INVOICE',
  SALE = 'SALE',
  RETURN = 'RETURN',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
  JOURNAL = 'JOURNAL',
  PAYABLE = 'PAYABLE',
  RECEIVABLE = 'RECEIVABLE',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  GOODS_ISSUE = 'GOODS_ISSUE',
  GOODS_RECEIPT = 'GOODS_RECEIPT',
  STOCK_TAKE = 'STOCK_TAKE',
  EMPLOYEE = 'EMPLOYEE', // NV
  QUOTATION = 'QUOTATION', // PBH
  TRANSFER_ORDER = 'TRANSFER_ORDER', // LDC
  STOCK_COUNT = 'STOCK_COUNT', // KK
  CASH_RECEIPT = 'CASH_RECEIPT', // PT
  CASH_PAYMENT = 'CASH_PAYMENT', // PC
  CASH_COUNT = 'CASH_COUNT', // KKQ
  BANK_RECEIPT = 'BANK_RECEIPT', // NTTK
  BANK_PAYMENT = 'BANK_PAYMENT', // UNC
  EXPENSE = 'EXPENSE', // CP
  RECONCILIATION = 'RECONCILIATION', // DS
  DEBT_OFFSET = 'DEBT_OFFSET', // BTCN
  CUSTOMER = 'CUSTOMER', // KH
  SUPPLIER = 'SUPPLIER', // NCC
  DELIVERY_PARTNER = 'DELIVERY_PARTNER', // DTGH
  WAREHOUSE = 'WAREHOUSE', // WH
}

export interface DocumentNumberRule {
  id: string;
  organizationId: string;
  branchId?: string;
  documentType: DocumentType;
  prefix: string;
  padding: number;
  resetPeriod?: 'YEARLY' | 'MONTHLY' | 'NEVER';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface DocumentNumberCounter {
  id: string;
  ruleId: string;
  periodKey: string;
  currentValue: number;
  createdAt: string;
  updatedAt: string;
}
