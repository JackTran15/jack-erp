import { DebtTypeFilterEnum } from "@erp/pos/constants/checkout.constant";
import type { DebtDocumentType } from "@erp/pos/types/debt.type";
import type { CustomerDebtRow } from "@erp/pos/interfaces/debt.interface";
import type { DebtEntry } from "@erp/pos/interfaces/customer-detail.interface";

/**
 * Map raw công nợ (`GET /invoices/customers/:id/debts`) sang dòng hiển thị của
 * `DebtTab`. "Giá trị" = `originalAmount`, "Dư nợ cuối" = `remainingAmount`.
 *
 * BE chỉ có 3 `documentType` (thực tế hiện chỉ tạo `credit_invoice`); ánh xạ
 * best-fit sang nhãn `DebtTypeFilterEnum` để hợp với dropdown lọc client-side
 * (so sánh `r.documentType === String(typeFilter)`). Endpoint không trả tên chi
 * nhánh → `branch` để rỗng, cột render "—".
 */
const DOCUMENT_TYPE_LABEL: Record<DebtDocumentType, DebtTypeFilterEnum> = {
  credit_invoice: DebtTypeFilterEnum.SALES_INVOICE_WITH_DEBT,
  payment_receipt: DebtTypeFilterEnum.CASH_RECEIPT,
  adjustment: DebtTypeFilterEnum.REDUCE_DEBT_RETURN_INVOICE,
};

export function mapCustomerDebts(
  rows: ReadonlyArray<CustomerDebtRow>,
): DebtEntry[] {
  return rows.map((d) => ({
    id: d.id,
    invoiceId: d.invoiceId,
    date: new Date(d.issuedAt),
    documentNumber: d.referenceCode,
    documentType: DOCUMENT_TYPE_LABEL[d.documentType] ?? d.documentType,
    amount: Number(d.originalAmount) || 0,
    remainingDebt: Number(d.remainingAmount) || 0,
    branch: "",
  }));
}
