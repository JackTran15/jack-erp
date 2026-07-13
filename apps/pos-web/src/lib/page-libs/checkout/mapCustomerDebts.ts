import { DebtTypeFilterEnum } from "@erp/pos/constants/checkout.constant";
import type { DebtDocumentType } from "@erp/pos/types/debt.type";
import type { CustomerDebtRow } from "@erp/pos/interfaces/debt.interface";
import type { DebtEntry } from "@erp/pos/interfaces/customer-detail.interface";

/**
 * Map sổ công nợ (`GET /invoices/customers/:id/debts`) sang dòng hiển thị của
 * `DebtTab`. "Giá trị" = `amount` (có dấu: âm là thu nợ), "Dư nợ cuối" =
 * `runningBalance` (số dư chạy do BE tính).
 *
 * Ánh xạ `documentType` sang nhãn `DebtTypeFilterEnum` để hợp với dropdown lọc
 * client-side (so sánh `r.documentType === String(typeFilter)`); các dòng thu nợ
 * (`collect_debt_*`) khớp mục "Thu nợ khách hàng bằng tiền mặt/thẻ". `branch` lấy
 * từ `branchName` BE trả về; rỗng khi không có → cột render "—".
 */
const DOCUMENT_TYPE_LABEL: Record<DebtDocumentType, DebtTypeFilterEnum> = {
  credit_invoice: DebtTypeFilterEnum.SALES_INVOICE_WITH_DEBT,
  payment_receipt: DebtTypeFilterEnum.CASH_RECEIPT,
  adjustment: DebtTypeFilterEnum.REDUCE_DEBT_RETURN_INVOICE,
  collect_debt_cash: DebtTypeFilterEnum.COLLECT_DEBT_CASH,
  collect_debt_bank: DebtTypeFilterEnum.COLLECT_DEBT_CARD,
};

export function mapCustomerDebts(
  rows: ReadonlyArray<CustomerDebtRow>,
): DebtEntry[] {
  return rows.map((d) => ({
    id: d.id,
    invoiceId: d.invoiceId,
    date: new Date(d.createdAt),
    documentNumber: d.referenceCode,
    documentType: DOCUMENT_TYPE_LABEL[d.documentType] ?? d.documentType,
    amount: Number(d.amount) || 0,
    remainingDebt: Number(d.runningBalance) || 0,
    branch: d.branchName ?? "",
  }));
}
