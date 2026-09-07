/**
 * `stock_ledger_entries.reference_type` → the document table that carries its
 * human-readable number, and the Vietnamese label shown in the stock card.
 *
 * Reference types with no source document (opening balances, data-import
 * corrections) map to no table and simply render without a number.
 */
export const REFERENCE_DOCUMENT_TABLES: Record<
  string,
  { table: string; column: string }
> = {
  GOODS_RECEIPT: { table: "goods_receipts", column: "document_number" },
  GOODS_ISSUE: { table: "goods_issues", column: "document_number" },
  TRANSFER: { table: "stock_transfers", column: "document_number" },
  TRANSFER_REVERSAL: { table: "stock_transfers", column: "document_number" },
  TRANSFER_EDIT_REVERSAL: {
    table: "stock_transfers",
    column: "document_number",
  },
  LOCATION_CHANGE: { table: "stock_transfers", column: "document_number" },
  ADJUSTMENT: { table: "stock_adjustments", column: "document_number" },
  STOCK_TAKE: { table: "stock_takes", column: "document_number" },
  PURCHASE: { table: "purchase_orders", column: "document_number" },
  PURCHASE_ORDER: { table: "purchase_orders", column: "document_number" },
  INVOICE: { table: "invoices", column: "code" },
  INVOICE_CANCEL: { table: "invoices", column: "code" },
  RETURN_INVOICE: { table: "invoices", column: "code" },
};

export const REFERENCE_TYPE_LABELS: Record<string, string> = {
  GOODS_RECEIPT: "Phiếu nhập kho",
  GOODS_ISSUE: "Phiếu xuất kho",
  TRANSFER: "Phiếu chuyển kho",
  TRANSFER_REVERSAL: "Huỷ phiếu chuyển kho",
  TRANSFER_EDIT_REVERSAL: "Sửa phiếu chuyển kho",
  LOCATION_CHANGE: "Chuyển vị trí",
  INVOICE: "Hoá đơn bán hàng",
  INVOICE_CANCEL: "Huỷ hoá đơn bán hàng",
  RETURN_INVOICE: "Hoá đơn trả hàng",
  ADJUSTMENT: "Phiếu điều chỉnh kho",
  STOCK_TAKE: "Phiếu kiểm kê",
  PURCHASE: "Phiếu nhập hàng mua",
  PURCHASE_ORDER: "Đơn mua hàng",
  INITIAL_STOCK: "Tồn kho ban đầu",
  IMPORT_ADJUSTMENT: "Điều chỉnh khi nhập dữ liệu",
  IMPORT_OPENING_BALANCE: "Tồn đầu kỳ (nhập dữ liệu)",
};

/** Options for the `Loại chứng từ` dropdown in the stock-card filter row. */
export const REFERENCE_TYPE_OPTIONS = Object.entries(REFERENCE_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export function resolveReferenceLabel(referenceType: string): string {
  return REFERENCE_TYPE_LABELS[referenceType] ?? referenceType;
}

/**
 * `stock_ledger_entries.reference_type` → the source voucher's own
 * user-entered "Diễn giải" column(s). `stock_ledger_entries.notes` is a
 * machine-generated string stamped at posting time (e.g. "Phiếu nhập kho
 * NK000240") — it is NOT the voucher's real description, so the stock card
 * must look this up separately, the same way it looks up `document_number`.
 *
 * `columns` with more than one entry means "first non-empty wins" (COALESCE) —
 * only STOCK_TAKE needs this, whose form writes to `purpose`/`conclusion`/
 * `notes` depending on which stage of the count it's in.
 *
 * INVOICE / INVOICE_CANCEL / RETURN_INVOICE are intentionally absent: the
 * `invoices` table has no description/notes column, so those reference types
 * fall through to the `ELSE NULL` arm of `descriptionSql()`.
 */
export const REFERENCE_DESCRIPTION_TABLES: Record<
  string,
  { table: string; columns: string[] }
> = {
  GOODS_RECEIPT: { table: "goods_receipts", columns: ["description"] },
  GOODS_ISSUE: { table: "goods_issues", columns: ["notes"] },
  TRANSFER: { table: "stock_transfers", columns: ["notes"] },
  TRANSFER_REVERSAL: { table: "stock_transfers", columns: ["notes"] },
  TRANSFER_EDIT_REVERSAL: { table: "stock_transfers", columns: ["notes"] },
  LOCATION_CHANGE: { table: "stock_transfers", columns: ["notes"] },
  ADJUSTMENT: { table: "stock_adjustments", columns: ["reason_description"] },
  STOCK_TAKE: { table: "stock_takes", columns: ["purpose", "conclusion", "notes"] },
  PURCHASE: { table: "purchase_orders", columns: ["notes"] },
  PURCHASE_ORDER: { table: "purchase_orders", columns: ["notes"] },
};

/**
 * `CASE reference_type WHEN … THEN (SELECT …) END` over
 * `REFERENCE_DESCRIPTION_TABLES`, mirroring `documentNumberSql()` above —
 * same reasoning: one index probe per row instead of joining every source
 * table.
 */
export function descriptionSql(alias = "sle"): string {
  const arms = Object.entries(REFERENCE_DESCRIPTION_TABLES).map(
    ([referenceType, { table, columns }]) => {
      const colExpr =
        columns.length > 1
          ? `COALESCE(${columns.map((c) => `d.${c}`).join(", ")})`
          : `d.${columns[0]}`;
      return `WHEN '${referenceType}' THEN (SELECT ${colExpr} FROM ${table} d WHERE d.id = ${alias}.reference_id)`;
    },
  );
  return `CASE ${alias}.reference_type ${arms.join(" ")} ELSE NULL END`;
}

/**
 * `CASE reference_type WHEN … THEN (SELECT …) END` over every mapped table.
 *
 * A `CASE` with correlated PK lookups beats joining all six tables: Postgres
 * evaluates only the arm that matches, so each row costs exactly one index
 * probe. Mirrors `DocumentDetailService`'s approach.
 */
export function documentNumberSql(alias = "sle"): string {
  const arms = Object.entries(REFERENCE_DOCUMENT_TABLES).map(
    ([referenceType, { table, column }]) =>
      `WHEN '${referenceType}' THEN (SELECT d.${column} FROM ${table} d WHERE d.id = ${alias}.reference_id)`,
  );
  return `CASE ${alias}.reference_type ${arms.join(" ")} ELSE NULL END`;
}
