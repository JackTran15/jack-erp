import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";
import { apiClient } from "../../lib/api-axios";
import type {
  CashReceipt,
  CashReceiptListQuery,
  CreateCashReceiptBody,
  CreateDebtCollectionBody,
  DebtCollectionResult,
  PaginatedList,
} from "../../pages/treasury/cash-vouchers.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

export function useCashReceiptsList(query: CashReceiptListQuery, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashReceipts(query),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedList<CashReceipt>>("/cash-receipts", {
          params: { query: query as Record<string, unknown> },
        }),
      ),
    enabled,
    staleTime: 30_000,
  });
}

export function useCashReceipt(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashReceipt(id),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<CashReceipt>("/cash-receipts/{id}", {
          params: { path: { id: id! } },
        }),
      ),
    enabled: enabled && Boolean(id),
  });
}

export function useCashReceiptMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cash-receipts"] });
    void qc.invalidateQueries({ queryKey: ["cash-payments"] });
    void qc.invalidateQueries({ queryKey: ["cash-vouchers"] });
    void qc.invalidateQueries({ queryKey: ["cash-receipts-payments-merged"] });
    void qc.invalidateQueries({ queryKey: ["cash-ledger"] });
    void qc.invalidateQueries({ queryKey: ["cash-accounts"] });
    void qc.invalidateQueries({ queryKey: ["customer-debts"] });
    void qc.invalidateQueries({ queryKey: ["customers-with-debt"] });
  };

  const create = useMutation({
    mutationFn: async (body: CreateCashReceiptBody) =>
      requireErpData(
        await erpApi.POST<CashReceipt>("/cash-receipts", { body }),
      ),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<CreateCashReceiptBody> }) =>
      requireErpData(
        await erpApi.PATCH<CashReceipt>("/cash-receipts/{id}", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/cash-receipts/{id}", {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidate,
  });

  const post = useMutation({
    mutationFn: async (id: string) =>
      requireErpData(
        await erpApi.POST<CashReceipt>("/cash-receipts/{id}/post", {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidate,
  });

  const reverse = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      requireErpData(
        await erpApi.POST<{ original: CashReceipt; reversal: CashReceipt }>(
          "/cash-receipts/{id}/reverse",
          { params: { path: { id } }, body: { reason } },
        ),
      ),
    onSuccess: invalidate,
  });

  // Debt collection (thu hồi nợ): create+post a receipt that settles the picked
  // invoice debts and credits the cash fund atomically (saga). Uses the raw
  // axios client (auth + X-Idempotency-Key auto-injected) since this endpoint is
  // not part of the generated OpenAPI client yet.
  const debtCollection = useMutation({
    mutationFn: async (body: CreateDebtCollectionBody) => {
      const { data } = await apiClient.post<DebtCollectionResult>(
        "/cash-receipts/debt-collection",
        body,
      );
      return data;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove, post, reverse, debtCollection };
}
