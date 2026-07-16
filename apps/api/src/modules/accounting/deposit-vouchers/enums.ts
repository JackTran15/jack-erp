/**
 * Deposit voucher enums (Phiếu thu/chi tiền gửi). Values mirror the Postgres enum
 * types created in the GĐ2 migration (1786600000000-DepositVouchersSchema).
 * English values only — Vietnamese is reserved for frontend display.
 */

export enum BankVoucherStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

export enum BankReceiptPurpose {
  OTHER = 'OTHER',
  DEBT_COLLECTION = 'DEBT_COLLECTION',
  OTHER_INCOME = 'OTHER_INCOME',
  INTER_BRANCH_IN = 'INTER_BRANCH_IN',
}

export enum BankReceiptReferenceType {
  INVOICE_DEBT = 'INVOICE_DEBT',
  RECEIVABLE = 'RECEIVABLE',
  TRANSFER = 'TRANSFER',
  MANUAL = 'MANUAL',
  REVERSAL = 'REVERSAL',
}

export enum BankPaymentPurpose {
  SUPPLIER_PAYMENT = 'SUPPLIER_PAYMENT',
  PURCHASE = 'PURCHASE',
  EXPENSE = 'EXPENSE',
  CASH_TRANSFER = 'CASH_TRANSFER',
  INTER_BRANCH_OUT = 'INTER_BRANCH_OUT',
  REFUND = 'REFUND',
  BANK_FEE = 'BANK_FEE',
  OTHER = 'OTHER',
}

export enum BankPaymentReferenceType {
  GOODS_RECEIPT = 'GOODS_RECEIPT',
  PAYABLE = 'PAYABLE',
  INVOICE = 'INVOICE',
  TRANSFER = 'TRANSFER',
  EXPENSE = 'EXPENSE',
  MANUAL = 'MANUAL',
  REVERSAL = 'REVERSAL',
}

export enum BankVoucherPartnerType {
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
  EMPLOYEE = 'EMPLOYEE',
  OTHER = 'OTHER',
}
