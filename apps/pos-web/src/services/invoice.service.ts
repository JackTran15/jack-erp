import { http } from "@erp/pos/lib/common/http";
import type {
  CheckoutInvoiceBody,
  CreateInvoiceBody,
} from "@erp/pos/dtos/invoice.dto";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";

export const invoiceService = {
  create: (body: CreateInvoiceBody): Promise<InvoiceRow> =>
    http.post<InvoiceRow>("/invoices", body),

  checkout: (id: string, body: CheckoutInvoiceBody): Promise<InvoiceRow> =>
    http.post<InvoiceRow>(
      `/invoices/${encodeURIComponent(id)}/checkout`,
      body,
    ),

  delete: (id: string): Promise<void> =>
    http.delete<void>(`/invoices/${encodeURIComponent(id)}`),

  listDrafts: (sessionId: string): Promise<InvoiceRow[]> => {
    const params = new URLSearchParams({ session_id: sessionId });
    return http.get<InvoiceRow[]>(`/invoices/drafts?${params.toString()}`);
  },
};
