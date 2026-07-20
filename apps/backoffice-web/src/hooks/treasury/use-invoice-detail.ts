import { useQuery } from "@tanstack/react-query";
import type { InvoiceDetailView } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";
import {
  LedgerCashInvoiceKindEnum,
  type LedgerCashInvoiceDetail,
} from "../../pages/treasury/ledger-cash/ledger-cash.types";

/**
 * `InvoiceDetailView` (what the API returns) → `LedgerCashInvoiceDetail` (what
 * `InvoiceDetailDialog` renders). The two shapes were built independently and
 * disagree on names (`discount`/`lineTotal` vs `discountAmount`/`totalAmount`)
 * and on `issuedAt` (ISO string vs Date), so the dialog needs this adapter
 * rather than the raw payload.
 */
export function toLedgerCashInvoiceDetail(
  view: InvoiceDetailView,
): LedgerCashInvoiceDetail {
  return {
    // The report endpoint has no return-invoice concept yet; every row it serves
    // is a normal sale.
    kind: LedgerCashInvoiceKindEnum.PAYMENT,
    code: view.code,
    cashier: view.cashier ?? "",
    customer: view.customerName ?? "",
    issuedAt: view.issuedAt ? new Date(view.issuedAt) : new Date(),
    phone: view.customerPhone ?? undefined,
    salesChannel: view.salesChannel ?? "",
    lines: view.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineAmount: l.lineAmount,
      discountAmount: l.discount,
      totalAmount: l.lineTotal,
      note: l.note ?? undefined,
    })),
    totalPayment: view.totalAmount,
    goodsAmount: view.subtotal,
    customerPaid: view.totalPaid,
    cashAmount: view.totalPaid,
  };
}

/**
 * Invoice detail for a treasury drill-down, looked up by invoice code — which is
 * exactly what `deposit_movements.document_number` already holds for POS rows.
 */
export function useInvoiceDetailByCode(code: string | undefined) {
  return useQuery({
    queryKey: ["invoice-detail", code],
    queryFn: async () => {
      const view = requireErpData(
        await erpApi.GET<InvoiceDetailView>("/reports/invoices/detail", {
          params: { query: { code: code! } },
        }),
      );
      return toLedgerCashInvoiceDetail(view);
    },
    enabled: Boolean(code),
    staleTime: 60_000,
  });
}
