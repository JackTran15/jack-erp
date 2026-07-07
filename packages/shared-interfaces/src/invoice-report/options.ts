/**
 * Shared dropdown-options contract for the chain-store report filters.
 * One generic endpoint serves every dropdown, distinguished by `type`.
 */

/** A single dropdown choice (value + display label, optional carry-along metadata). */
export interface IDropdownOption {
  value: string | number;
  label: string;
  metadata?: Record<string, unknown>;
}

/** A static {value,label} option (used for enum dropdowns + column `filterOptions`). */
export interface ReportFilterOption {
  value: string;
  label: string;
}

/**
 * The `type` discriminator of the shared filter-options endpoint.
 * Dynamic types resolve from real data (org-scoped, searchable); enum types
 * return the static tables below.
 */
export enum ReportFilterOptionType {
  // Dynamic (DB-backed, searchable)
  STORE = 'store',
  CASHIER = 'cashier',
  SALESPERSON = 'salesperson',
  CUSTOMER = 'customer',
  PRODUCT_GROUP = 'productGroup',
  BRAND = 'brand',
  UNIT = 'unit',
  /** Org-scoped storages (kho) — inventory reports only. */
  WAREHOUSE = 'warehouse',
  // Static enums
  INVOICE_STATUS = 'invoiceStatus',
  STAT_DATE_TYPE = 'statDateType',
  PRODUCT_TYPE = 'productType',
  STAT_BY = 'statBy',
}

/**
 * Invoice statuses served to the FE status filter. Mirrors the real backend
 * `InvoiceStatus` enum (not the aspirational e-commerce set) — the FE renders
 * whatever this returns. VI labels live here so backend source stays English.
 */
export const INVOICE_STATUS_OPTIONS: ReportFilterOption[] = [
  { value: 'draft', label: 'Lưu tạm' },
  { value: 'pending', label: 'Chờ xử lý' },
  { value: 'paid', label: 'Hoàn thành' },
  { value: 'debt', label: 'Công nợ' },
  { value: 'partial_debt', label: 'Nợ một phần' },
  { value: 'cancelled', label: 'Đã hủy' },
];

/** Which invoice date drives the report period (§C.2). */
export const STAT_DATE_TYPE_OPTIONS: ReportFilterOption[] = [
  { value: 'invoice_date', label: 'Ngày hóa đơn' },
  { value: 'created_date', label: 'Ngày tạo' },
];

/** Product kind filter for revenue-by-item (§C.3). */
export const PRODUCT_TYPE_OPTIONS: ReportFilterOption[] = [
  { value: 'product', label: 'Hàng hóa' },
  { value: 'service', label: 'Dịch vụ' },
  { value: 'combo', label: 'Combo - đóng gói' },
];

/** Row grain for revenue-by-item — "Thống kê theo" (§C.4). */
export const STAT_BY_OPTIONS: ReportFilterOption[] = [
  { value: 'item', label: 'Hàng hóa' },
  { value: 'parent', label: 'Mẫu mã' },
  { value: 'group', label: 'Nhóm hàng hóa' },
];

/** Lookup the static option table for an enum `type` (null for dynamic types). */
export const REPORT_ENUM_OPTION_TABLES: Partial<
  Record<ReportFilterOptionType, ReportFilterOption[]>
> = {
  [ReportFilterOptionType.INVOICE_STATUS]: INVOICE_STATUS_OPTIONS,
  [ReportFilterOptionType.STAT_DATE_TYPE]: STAT_DATE_TYPE_OPTIONS,
  [ReportFilterOptionType.PRODUCT_TYPE]: PRODUCT_TYPE_OPTIONS,
  [ReportFilterOptionType.STAT_BY]: STAT_BY_OPTIONS,
};
