import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";
import type {
  BankReceipt,
  BankReceiptListQuery,
  CreateBankReceiptBody,
  PaginatedList,
  UpdateBankReceiptBody,
} from "../../pages/treasury/bank-vouchers.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

export function useBankReceiptsList(query: BankReceiptListQuery, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.bankReceipts(query),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedList<BankReceipt>>("/bank-receipts", {
          params: { query: query as Record<string, unknown> },
        }),
      ),
    enabled,
    staleTime: 30_000,
  });
}

export function useBankReceipt(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.bankReceipt(id),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<BankReceipt>("/bank-receipts/{id}", {
          params: { path: { id: id! } },
        }),
      ),
    enabled: enabled && Boolean(id),
  });
}

export function useBankReceiptMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["bank-receipts"] });
    void qc.invalidateQueries({ queryKey: ["bank-payments"] });
    void qc.invalidateQueries({ queryKey: ["deposit-vouchers"] });
    void qc.invalidateQueries({ queryKey: ["deposit-ledger"] });
    void qc.invalidateQueries({ queryKey: ["deposit-accounts"] });
    void qc.invalidateQueries({ queryKey: ["voucher-partners", "customer-debts"] });
  };

  const create = useMutation({
    mutationFn: async (body: CreateBankReceiptBody) =>
      requireErpData(
        await erpApi.POST<BankReceipt>("/bank-receipts", { body }),
      ),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateBankReceiptBody }) =>
      requireErpData(
        await erpApi.PATCH<BankReceipt>("/bank-receipts/{id}", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/bank-receipts/{id}", {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidate,
  });

  const post = useMutation({
    mutationFn: async (id: string) =>
      requireErpData(
        await erpApi.POST<BankReceipt>("/bank-receipts/{id}/post", {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidate,
  });

  const reverse = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      requireErpData(
        await erpApi.POST<{ original: BankReceipt; reversal: BankReceipt }>(
          "/bank-receipts/{id}/reverse",
          { params: { path: { id } }, body: { reason } },
        ),
      ),
    onSuccess: invalidate,
  });

  return { create, update, remove, post, reverse };
}
