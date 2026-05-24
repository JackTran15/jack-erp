import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { INVOICE_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { invoiceService } from "@erp/pos/services/invoice.service";
import type {
  CheckoutInvoiceBody,
  CreateInvoiceBody,
  UpdateInvoiceBody,
} from "@erp/pos/dtos/invoice.dto";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";

export function useCreateInvoiceMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  CreateInvoiceBody
> {
  const qc = useQueryClient();
  return useMutation<InvoiceRow, Error, CreateInvoiceBody>({
    mutationFn: (body) => invoiceService.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.DRAFTS_PREFIX });
    },
  });
}

interface UpdateInvoiceVars {
  id: string;
  body: UpdateInvoiceBody;
}

/**
 * `PATCH /invoices/:id` — cập nhật draft (thay items/customer/note). Dùng khi
 * tab được restore từ một draft: lưu/thanh toán lại sẽ ghi đè chính draft đó.
 */
export function useUpdateInvoiceMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  UpdateInvoiceVars
> {
  const qc = useQueryClient();
  return useMutation<InvoiceRow, Error, UpdateInvoiceVars>({
    mutationFn: ({ id, body }) => invoiceService.update(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.DRAFTS_PREFIX });
    },
  });
}

interface CheckoutInvoiceVars {
  id: string;
  body: CheckoutInvoiceBody;
}

export function useCheckoutInvoiceMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  CheckoutInvoiceVars
> {
  const qc = useQueryClient();
  return useMutation<InvoiceRow, Error, CheckoutInvoiceVars>({
    mutationFn: ({ id, body }) => invoiceService.checkout(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.ALL });
    },
  });
}

interface DeleteInvoiceContext {
  previousDrafts: Array<[readonly unknown[], InvoiceRow[] | undefined]>;
}

export function useDeleteInvoiceMutation(): UseMutationResult<
  void,
  Error,
  string,
  DeleteInvoiceContext
> {
  const qc = useQueryClient();
  return useMutation<void, Error, string, DeleteInvoiceContext>({
    mutationFn: (id) => invoiceService.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: INVOICE_KEYS.DRAFTS_PREFIX });
      const previousDrafts = qc.getQueriesData<InvoiceRow[]>({
        queryKey: INVOICE_KEYS.DRAFTS_PREFIX,
      });
      qc.setQueriesData<InvoiceRow[]>(
        { queryKey: INVOICE_KEYS.DRAFTS_PREFIX },
        (old) => (old ? old.filter((row) => row.id !== id) : old),
      );
      return { previousDrafts };
    },
    onError: (_err, _id, context) => {
      if (!context) return;
      for (const [key, data] of context.previousDrafts) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.DRAFTS_PREFIX });
    },
  });
}

/**
 * Chi tiết một hóa đơn — `GET /invoices/:id` (kèm `items[]` + thông tin thanh
 * toán). Truyền `undefined` để tắt query khi chưa cần.
 */
export function useInvoiceDetailQuery(
  id: string | undefined,
): UseQueryResult<InvoiceRow, Error> {
  return useQuery<InvoiceRow, Error>({
    queryKey: INVOICE_KEYS.DETAIL(id ?? ""),
    queryFn: () => invoiceService.getById(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

interface UseDraftInvoicesQueryInput {
  sessionId: string;
  enabled?: boolean;
}

export function useDraftInvoicesQuery(
  input: UseDraftInvoicesQueryInput,
): UseQueryResult<InvoiceRow[], Error> {
  return useQuery<InvoiceRow[], Error>({
    queryKey: INVOICE_KEYS.DRAFTS(input.sessionId),
    queryFn: () => invoiceService.listDrafts(input.sessionId),
    enabled: Boolean(input.sessionId) && (input.enabled ?? true),
    staleTime: 5_000,
  });
}
