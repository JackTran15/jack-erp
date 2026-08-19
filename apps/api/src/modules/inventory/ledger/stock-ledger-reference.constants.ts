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
