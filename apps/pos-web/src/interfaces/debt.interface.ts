import type { DebtDocumentType, DebtStatus } from "@erp/pos/types/debt.type";

/**
 * Một dòng sổ công nợ của khách — từ `GET /invoices/customers/:customerId/debts`.
 * BE merge chứng từ ghi nợ (`invoice_debts`) với các lần thu nợ / Phiếu thu
 * (`debt_payments`), sắp xếp cũ → mới kèm số dư chạy.
 *
 * `amount` có dấu: dương làm tăng nợ, âm là thu nợ. `runningBalance` là "Dư nợ
 * cuối" sau chứng từ đó. Các cột `numeric(18,2)` được TypeORM serialize ra
 * **string** qua JSON — mapper phải `Number(...)`. `issuedAt` dạng `"YYYY-MM-DD"`.
 */
export interface CustomerDebtRow {
  id: string;
  kind: "debt" | "collection";
  invoiceId: string;
  referenceCode: string;
  documentType: DebtDocumentType;
  amount: number;
  runningBalance: number;
  issuedAt: string;
  /** Thời điểm tạo chứng từ (ISO) — dùng cho cột "Ngày hóa đơn" và sắp xếp. */
  createdAt: string;
  branchId: string | null;
  branchName?: string | null;
  status?: DebtStatus;
}
