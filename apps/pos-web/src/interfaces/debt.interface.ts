import type { DebtDocumentType, DebtStatus } from "@erp/pos/types/debt.type";

/**
 * Một dòng công nợ của khách — raw BE entity từ
 * `GET /invoices/customers/:customerId/debts` (`invoice_debts`).
 *
 * Các cột `numeric(18,2)` (originalAmount / paidAmount / remainingAmount) được
 * TypeORM serialize ra **string** qua JSON — mapper phải `Number(...)` trước khi
 * dùng. `issuedAt` dạng `"YYYY-MM-DD"`.
 */
export interface CustomerDebtRow {
  id: string;
  referenceCode: string;
  invoiceId: string;
  customerId: string;
  documentType: DebtDocumentType;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  issuedAt: string;
  dueDate?: string | null;
  settledAt?: string | null;
  status: DebtStatus;
  note?: string | null;
  branchId: string;
}
