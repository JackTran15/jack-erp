export enum PayableStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  PARTIALLY_SETTLED = 'PARTIALLY_SETTLED',
  SETTLED = 'SETTLED',
  VOIDED = 'VOIDED',
}

export enum ReceivableStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  PARTIALLY_SETTLED = 'PARTIALLY_SETTLED',
  SETTLED = 'SETTLED',
  VOIDED = 'VOIDED',
  WRITTEN_OFF = 'WRITTEN_OFF',
}

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export enum JournalStatus {
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

export enum JournalSource {
  SALE = 'SALE',
  RETURN = 'RETURN',
  EXCHANGE = 'EXCHANGE',
  EXPENSE = 'EXPENSE',
  CASH_MOVEMENT = 'CASH_MOVEMENT',
  MANUAL = 'MANUAL',
  TRANSFER = 'TRANSFER',
}

export interface Account {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface JournalEntry {
  id: string;
  organizationId: string;
  branchId?: string;
  source: JournalSource;
  referenceId: string;
  referenceType: string;
  description?: string;
  lines: JournalLine[];
  postedAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface Payable {
  id: string;
  organizationId: string;
  branchId?: string;
  vendorName: string;
  amount: number;
  settledAmount: number;
  status: PayableStatus;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface PayableSettlement {
  id: string;
  payableId: string;
  amount: number;
  settledAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Receivable {
  id: string;
  organizationId: string;
  branchId?: string;
  customerId: string;
  amount: number;
  settledAmount: number;
  status: ReceivableStatus;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ReceivableSettlement {
  id: string;
  receivableId: string;
  amount: number;
  settledAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Expense {
  id: string;
  organizationId: string;
  branchId?: string;
  description: string;
  amount: number;
  accountId: string;
  expenseDate: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export enum CashAccountType {
  REGISTER = 'REGISTER',
  SAFE = 'SAFE',
  PETTY_CASH = 'PETTY_CASH',
}

export interface CashAccount {
  id: string;
  organizationId: string;
  branchId: string;
  name: string;
  type: CashAccountType;
  balance: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface CashMovement {
  id: string;
  organizationId: string;
  branchId: string;
  cashAccountId: string;
  amount: number;
  direction: 'IN' | 'OUT';
  referenceId?: string;
  referenceType?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
