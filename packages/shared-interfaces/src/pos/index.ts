export enum SessionStatus {
  OPEN = 'OPEN',
  ACTIVE_SALES = 'ACTIVE_SALES',
  CLOSING = 'CLOSING',
  CLOSED = 'CLOSED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  CREDIT = 'CREDIT',
  OTHER = 'OTHER',
}

export enum InvoiceType {
  SALE = 'SALE',
  RETURN = 'RETURN',
  EXCHANGE = 'EXCHANGE',
}

export enum RefundMethod {
  CASH = 'CASH',
  STORE_CREDIT = 'STORE_CREDIT',
  OFFSET = 'OFFSET',
}

export enum ItemDirection {
  OUT = 'OUT',
  IN = 'IN',
}

export enum CustomerCreditStatus {
  OPEN = 'OPEN',
  CONSUMED = 'CONSUMED',
  EXPIRED = 'EXPIRED',
}

export interface PosSession {
  id: string;
  organizationId: string;
  branchId: string;
  userId: string;
  status: SessionStatus;
  openingBalance: number;
  closingBalance?: number;
  openedAt: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Sale {
  id: string;
  organizationId: string;
  branchId: string;
  sessionId: string;
  customerId?: string;
  lines: SaleLine[];
  payments: Payment[];
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface SaleLine {
  id: string;
  saleId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface Payment {
  id: string;
  saleId: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  createdAt: string;
}

export interface Return {
  id: string;
  organizationId: string;
  branchId: string;
  originalSaleId: string;
  lines: ReturnLine[];
  totalAmount: number;
  reason: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ReturnLine {
  id: string;
  returnId: string;
  originalSaleLineId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}
