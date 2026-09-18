/**
 * The SQL every cash-fund report shares: the four POSTED voucher tables read as
 * one relation, on the voucher date (ADR-02), without reversals (A-04).
 *
 * Parameters are positional and fixed so the fragments compose:
 *   $1 organization_id
 *   $2 branch ids as text[] — NULL means "no branch predicate" (consolidated)
 * Callers append their own parameters from $3 on.
 *
 * `fund` is which money moved ('cash' | 'deposit'), `direction` which way
 * ('in' | 'out'); `purpose` and `reference_type` are cast to text so the four
 * distinct Postgres enums line up in the UNION.
 */

export type VoucherTable =
  | 'cash_receipts'
  | 'cash_payments'
  | 'bank_receipts'
  | 'bank_payments';

interface TableSpec {
  table: VoucherTable;
  kind: 'CASH_RECEIPT' | 'CASH_PAYMENT' | 'BANK_RECEIPT' | 'BANK_PAYMENT';
  fund: 'cash' | 'deposit';
  direction: 'in' | 'out';
  /** The voucher-date column of this table. */
  dateColumn: 'voucher_date' | 'doc_date';
  /** The line table + its FK back to the header. */
  lineTable: string;
  lineFk: string;
  /** The user id column of "Nhân viên thu/chi" on this table. */
  staffColumn: string;
  /** The party name column (payer on receipts, payee on payments). */
  partyNameColumn: 'payer_name' | 'payee_name';
  /** Deposit account column, NULL on the cash side. */
  depositAccountExpr: string;
}

export const VOUCHER_TABLES: readonly TableSpec[] = [
  {
    table: 'cash_receipts',
    kind: 'CASH_RECEIPT',
    fund: 'cash',
    direction: 'in',
    dateColumn: 'voucher_date',
    lineTable: 'cash_receipt_lines',
    lineFk: 'cash_receipt_id',
    staffColumn: 'staff_id::text',
    partyNameColumn: 'payer_name',
    depositAccountExpr: 'NULL::uuid',
  },
  {
    table: 'cash_payments',
    kind: 'CASH_PAYMENT',
    fund: 'cash',
    direction: 'out',
    dateColumn: 'voucher_date',
    lineTable: 'cash_payment_lines',
    lineFk: 'cash_payment_id',
    staffColumn: 'staff_id::text',
    partyNameColumn: 'payee_name',
    depositAccountExpr: 'NULL::uuid',
  },
  {
    table: 'bank_receipts',
    kind: 'BANK_RECEIPT',
    fund: 'deposit',
    direction: 'in',
    dateColumn: 'doc_date',
    lineTable: 'bank_receipt_lines',
    lineFk: 'bank_receipt_id',
    staffColumn: 'collected_by',
    partyNameColumn: 'payer_name',
    depositAccountExpr: 'deposit_account_id',
  },
  {
    table: 'bank_payments',
    kind: 'BANK_PAYMENT',
    fund: 'deposit',
    direction: 'out',
    dateColumn: 'doc_date',
    lineTable: 'bank_payment_lines',
    lineFk: 'bank_payment_id',
    staffColumn: 'paid_by',
    partyNameColumn: 'payee_name',
    depositAccountExpr: 'deposit_account_id',
  },
];

/** "Thu từ bán hàng" (A-02): receipts whose purpose is a sale or a debt collection. */
export const SALES_RECEIPT_PURPOSES = ['POS_SALE', 'DEBT_COLLECTION'] as const;
/** "Chi mua hàng hóa" (A-02): payments to suppliers for goods. */
export const PURCHASE_PAYMENT_PURPOSES = ['PURCHASE', 'SUPPLIER_PAYMENT'] as const;

const quoteList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(', ');

/**
 * The header predicate of one voucher table, with `h` as its alias. Everything
 * the reports agree on lives here so no definition can forget the reversal or
 * the soft delete.
 */
export function voucherHeaderWhere(alias = 'h'): string {
  return [
    `${alias}.organization_id = $1`,
    `${alias}.status = 'POSTED'`,
    `${alias}.deleted_at IS NULL`,
    `(${alias}.reference_type IS NULL OR ${alias}.reference_type::text <> 'REVERSAL')`,
    `($2::text[] IS NULL OR ${alias}.branch_id = ANY($2::text[]))`,
  ].join(' AND ');
}

/**
 * All posted vouchers as one relation:
 * (kind, fund, direction, id, doc_date, purpose, reference_type, reference_id,
 *  document_number, total_amount, branch_id, staff_id, partner_type,
 *  partner_id, partner_name, party_name, reason, deposit_account_id)
 */
export function voucherHeadersSql(): string {
  return VOUCHER_TABLES.map(
    (t) => `SELECT '${t.kind}'::text AS kind, '${t.fund}'::text AS fund, '${t.direction}'::text AS direction,
       h.id, h.${t.dateColumn}::date AS doc_date, h.purpose::text AS purpose,
       h.reference_type::text AS reference_type, h.reference_id, h.document_number,
       h.total_amount::numeric AS total_amount, h.branch_id::text AS branch_id,
       h.${t.staffColumn} AS staff_id, h.partner_type::text AS partner_type, h.partner_id,
       h.partner_name_snapshot AS partner_name, h.${t.partyNameColumn} AS party_name,
       h.reason, h.${t.depositAccountExpr} AS deposit_account_id
     FROM ${t.table} h
     WHERE ${voucherHeaderWhere('h')}`,
  ).join('\n UNION ALL \n');
}

/**
 * All lines of posted vouchers as one relation:
 * (kind, fund, direction, voucher_id, line_id, doc_date, purpose, category_id,
 *  amount, description)
 */
export function voucherLinesSql(): string {
  return VOUCHER_TABLES.map(
    (t) => `SELECT '${t.kind}'::text AS kind, '${t.fund}'::text AS fund, '${t.direction}'::text AS direction,
       h.id AS voucher_id, l.id AS line_id, h.${t.dateColumn}::date AS doc_date,
       h.purpose::text AS purpose, l.category_id, l.amount::numeric AS amount, l.description
     FROM ${t.lineTable} l
     JOIN ${t.table} h ON h.id = l.${t.lineFk}
     WHERE ${voucherHeaderWhere('h')}`,
  ).join('\n UNION ALL \n');
}

/** SQL predicate: this header row belongs to the sales / purchase bucket (A-02). */
export function fixedBucketPredicate(alias = 'v'): string {
  return `((${alias}.direction = 'in' AND ${alias}.purpose IN (${quoteList(SALES_RECEIPT_PURPOSES)}))
       OR (${alias}.direction = 'out' AND ${alias}.purpose IN (${quoteList(PURCHASE_PAYMENT_PURPOSES)})))`;
}
