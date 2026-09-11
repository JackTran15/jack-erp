/**
 * Grid width hints (px) for the identity columns every money report shares —
 * SKU, item name, customer, document number, date… — so the same column is the
 * same width on "Doanh thu theo mặt hàng", "Công nợ phải thu chi tiết" and
 * "Lợi nhuận theo mặt hàng" alike. The scale is the one the inventory reports
 * already use (`inventory-reports/report/reports/*.report.ts`: sku 140,
 * name 220, unit 110, group 140, brand 120, date 120, documentNumber 130).
 *
 * Only identity/text columns are listed on purpose. Amount and quantity
 * columns are left without a hint: they are short, numerous and report-specific,
 * and the FE falls back to its numeric default for them
 * (`defaultReportColumnWidth`). The same hint also sizes the exported Excel
 * column (`report-export.service.ts` converts px → character units).
 */
export const REPORT_COLUMN_WIDTHS: Readonly<Record<string, number>> = {
  // Time
  date: 120,
  time: 90,

  // Document
  invoiceCode: 140,
  documentNumber: 130,
  documentType: 140,
  documentDescription: 220,
  reference: 130,
  status: 110,

  // Item
  sku: 140,
  skuCode: 140,
  itemName: 220,
  itemCategory: 140,
  categoryCode: 130,
  categoryName: 200,
  brand: 120,
  unit: 110,
  location: 220,
  locationCode: 220,
  locationName: 220,
  supplier: 180,

  // Customer / supplier
  customer: 180,
  customerCode: 130,
  customerName: 200,
  customerGroup: 140,
  customerPhone: 120,
  customerEmail: 180,
  address: 220,
  membershipCardNumber: 140,
  membershipTier: 110,
  supplierCode: 130,
  supplierName: 200,
  receiver: 150,
  receiverPhone: 120,

  // Store / staff
  storeCode: 110,
  storeName: 180,
  branchName: 180,
  salesChannel: 130,
  cashier: 150,
  cashierCode: 130,
  salesperson: 150,
  salespersonCode: 130,

  // Free text
  note: 200,
  invoiceNote: 200,
  itemNote: 200,

  // Business results ("Kết quả kinh doanh") row label
  khoanMuc: 220,
};

/** Width hint for a column key, or undefined when the FE default applies. */
export function reportColumnWidth(col: string): number | undefined {
  return REPORT_COLUMN_WIDTHS[col];
}
