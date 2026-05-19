import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { INVOICE_KEYS } from "@erp/pos/constants/react-query-key.constant";
import {
  invoiceService,
  type CheckoutInvoiceBody,
  type CreateInvoiceBody,
  type InvoiceRow,
} from "@erp/pos/services/invoice.service";

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
