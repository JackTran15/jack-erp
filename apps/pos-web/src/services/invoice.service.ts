import { http } from "@erp/pos/lib/common/http";
import type {
  CheckoutInvoiceBody,
  CreateInvoiceBody,
  ListInvoicesParams,
} from "@erp/pos/dtos/invoice.dto";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
import type { Paginated } from "@erp/pos/interfaces/paginated.interface";

export const invoiceService = {
  create: (body: CreateInvoiceBody): Promise<InvoiceRow> =>
    http.post<InvoiceRow>("/invoices", body),

  list: (params: ListInvoicesParams = {}): Promise<Paginated<InvoiceRow>> => {
    const qs = new URLSearchParams();
    if (params.customerId) qs.set("customerId", params.customerId);
    if (params.status) qs.set("status", params.status);
    if (params.isDraft !== undefined) qs.set("isDraft", String(params.isDraft));
    if (params.branchId) qs.set("branchId", params.branchId);
    if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
    if (params.dateTo) qs.set("dateTo", params.dateTo);
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return http.get<Paginated<InvoiceRow>>(`/invoices${suffix}`);
  },

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
