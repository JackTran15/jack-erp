/**
 * Cột của 2 lưới trang "Phát hành hóa đơn điện tử". `value` là giá trị thô dùng
 * cho cả hiển thị lẫn lọc cột (fetcher mock lọc theo đúng bảng này).
 */
import type { ColumnFilterKind, ColumnFilterSelectOption } from "../../../../components/table/BaseDataTable";
import {
  EINVOICE_EMAIL_STATUS_OPTIONS,
  EINVOICE_INVOICE_STATUS_OPTIONS,
  EINVOICE_ISSUE_STATUS_OPTIONS,
  EINVOICE_TAX_AUTHORITY_STATUS_OPTIONS,
} from "../_mock/einvoice.mock";
import type { EInvoiceRecord } from "./einvoice.interface";

export interface EInvoiceColumnDef {
  key: string;
  header: string;
  width: number;
  align?: "right";
  filterKind: ColumnFilterKind;
  filterOptions?: ColumnFilterSelectOption[];
  /** Kiểu hiển thị của `value`. */
  format?: "date" | "money";
  value: (row: EInvoiceRecord) => string | number;
}

const toOptions = (values: readonly string[]): ColumnFilterSelectOption[] =>
  values.map((v) => ({ value: v, label: v }));

const recipientEmails = (row: EInvoiceRecord) => row.buyer.recipientEmails || row.buyer.email;

export const UNISSUED_COLUMNS: readonly EInvoiceColumnDef[] = [
  { key: "invoiceDate", header: "Ngày hóa đơn bán hàng", width: 130, filterKind: "date", format: "date", value: (r) => r.invoiceDate },
  { key: "invoiceCode", header: "Số hóa đơn", width: 120, filterKind: "symbol", value: (r) => r.invoiceCode },
  { key: "total", header: "Tổng tiền", width: 120, align: "right", filterKind: "number-range", format: "money", value: (r) => r.total },
  { key: "taxCode", header: "Mã số thuế", width: 120, filterKind: "symbol", value: (r) => r.buyer.taxCode },
  { key: "customer", header: "Khách hàng Tên công ty", width: 120, filterKind: "symbol", value: (r) => r.buyer.unitName },
  { key: "address", header: "Địa chỉ", width: 200, filterKind: "symbol", value: (r) => r.buyer.address },
  { key: "phone", header: "Số điện thoại", width: 120, filterKind: "symbol", value: (r) => r.buyer.phone },
  { key: "recipientName", header: "Tên người nhận", width: 160, filterKind: "symbol", value: (r) => r.buyer.recipientName },
  { key: "email", header: "Email", width: 100, filterKind: "symbol", value: recipientEmails },
  { key: "unissuedReason", header: "Lý do chưa phát hành", width: 110, filterKind: "symbol", value: (r) => r.unissuedReason },
];

export const ISSUED_COLUMNS: readonly EInvoiceColumnDef[] = [
  { key: "invoiceCode", header: "Số hóa đơn", width: 110, filterKind: "symbol", value: (r) => r.invoiceCode },
  { key: "issuedDate", header: "Ngày phát hành HĐ", width: 140, filterKind: "date-compare", format: "date", value: (r) => r.issue?.issuedDate ?? "" },
  { key: "total", header: "Tổng tiền", width: 110, align: "right", filterKind: "number-range", format: "money", value: (r) => r.total },
  { key: "templateSymbol", header: "Mẫu số ký hiệu", width: 110, filterKind: "symbol", value: (r) => r.issue?.templateSymbol ?? "" },
  { key: "providerInvoiceNo", header: "Số hóa đơn MISA meInvoice", width: 150, filterKind: "symbol", value: (r) => r.issue?.providerInvoiceNo ?? "" },
  { key: "customer", header: "Khách hàng/Tên công ty", width: 150, filterKind: "symbol", value: (r) => r.buyer.unitName },
  { key: "taxCode", header: "Mã số thuế", width: 110, filterKind: "symbol", value: (r) => r.buyer.taxCode },
  { key: "address", header: "Địa chỉ", width: 160, filterKind: "symbol", value: (r) => r.buyer.address },
  { key: "phone", header: "Số điện thoại", width: 140, filterKind: "symbol", value: (r) => r.buyer.phone },
  {
    key: "recipient",
    header: "Tên người nhận Email",
    width: 180,
    filterKind: "symbol",
    value: (r) => [r.buyer.recipientName, recipientEmails(r)].filter(Boolean).join(" · "),
  },
  { key: "idNumber", header: "CCCD", width: 100, filterKind: "symbol", value: (r) => r.buyer.idNumber },
  { key: "issueStatus", header: "Trạng thái phát hành", width: 130, filterKind: "select", filterOptions: toOptions(EINVOICE_ISSUE_STATUS_OPTIONS), value: (r) => r.issue?.issueStatus ?? "" },
  { key: "invoiceStatus", header: "Trạng thái hóa đơn", width: 150, filterKind: "select", filterOptions: toOptions(EINVOICE_INVOICE_STATUS_OPTIONS), value: (r) => r.issue?.invoiceStatus ?? "" },
  { key: "taxAuthorityStatus", header: "Trạng thái gửi CQT", width: 130, filterKind: "select", filterOptions: toOptions(EINVOICE_TAX_AUTHORITY_STATUS_OPTIONS), value: (r) => r.issue?.taxAuthorityStatus ?? "" },
  { key: "emailStatus", header: "Trạng thái gửi Email", width: 130, filterKind: "select", filterOptions: toOptions(EINVOICE_EMAIL_STATUS_OPTIONS), value: (r) => r.issue?.emailStatus ?? "" },
  { key: "errorNote", header: "Ghi chú sai sót", width: 150, filterKind: "symbol", value: (r) => r.issue?.errorNote ?? "" },
];

export const UNISSUED_COLUMN_KEYS = UNISSUED_COLUMNS.map((c) => c.key);
export const ISSUED_COLUMN_KEYS = ISSUED_COLUMNS.map((c) => c.key);

const MONEY = new Intl.NumberFormat("vi-VN");

export function formatEInvoiceMoney(value: number): string {
  return MONEY.format(value);
}

/** `2026-09-22` → `22/09/2026`. */
export function formatEInvoiceDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatEInvoiceCell(def: EInvoiceColumnDef, row: EInvoiceRecord): string {
  const value = def.value(row);
  if (def.format === "money") return formatEInvoiceMoney(Number(value));
  if (def.format === "date") return formatEInvoiceDate(String(value));
  return String(value);
}
