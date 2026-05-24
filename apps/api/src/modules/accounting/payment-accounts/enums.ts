/**
 * Payment-account config enums. Values mirror the Postgres enum types created in
 * the migration (1781300000000-PaymentAccountsAndDefaultAccounts). English values
 * only — Vietnamese is reserved for frontend display.
 */

/**
 * Payment method a receiving account is mapped to. String values intentionally
 * match {@link InvoicePaymentMethod} (`cash`/`bank_transfer`/`card`) so a payment
 * line's method can be validated directly against the configured accounts.
 */
export enum PaymentAccountMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CARD = 'card',
}

/**
 * Role of a default COA account resolved server-side. Both values ship up front so
 * later phases never need `ALTER TYPE ... ADD VALUE` (not transaction-revertible).
 */
export enum AccountingDefaultAccountRole {
  REVENUE = 'REVENUE',
  RECEIVABLE = 'RECEIVABLE',
}
