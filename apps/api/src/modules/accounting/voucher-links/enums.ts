/**
 * Voucher link enums. Values mirror the Postgres enum types created in
 * 1787700000000-VoucherLinks. English values only — Vietnamese is reserved for
 * frontend display.
 */

/** Which voucher table an endpoint of a link refers to. */
export enum VoucherLinkKind {
  CASH_RECEIPT = 'CASH_RECEIPT',
  CASH_PAYMENT = 'CASH_PAYMENT',
  BANK_RECEIPT = 'BANK_RECEIPT',
  BANK_PAYMENT = 'BANK_PAYMENT',
}

/**
 * What the `from` voucher is to the `to` voucher. Read as a sentence:
 * "receipt PT0001 was REFUNDED_BY payment PC0009".
 */
export enum VoucherLinkRelation {
  REFUNDED_BY = 'REFUNDED_BY',
}
