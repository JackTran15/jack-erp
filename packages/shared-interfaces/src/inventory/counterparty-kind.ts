/**
 * Kind of "Đối tượng" (counterparty) attached to a goods receipt / goods issue
 * document. Backed by the Postgres enum `doc_counterparty_kind_enum`.
 */
export enum DocCounterpartyKind {
  SUPPLIER = 'supplier',
  CUSTOMER = 'customer',
}
