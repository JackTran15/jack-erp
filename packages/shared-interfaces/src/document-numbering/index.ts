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
