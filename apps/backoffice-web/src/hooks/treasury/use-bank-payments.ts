import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";
import type {
  BankPayment,
  BankPaymentListQuery,
  CreateBankPaymentBody,
  PaginatedList,
  UpdateBankPaymentBody,
} from "../../pages/treasury/bank-vouchers.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

export function useBankPaymentsList(query: BankPaymentListQuery, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.bankPayments(query),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedList<BankPayment>>("/bank-payments", {
          params: { query: query as Record<string, unknown> },
        }),
      ),
    enabled,
    staleTime: 30_000,
  });
}

export function useBankPayment(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.bankPayment(id),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<BankPayment>("/bank-payments/{id}", {
          params: { path: { id: id! } },
        }),
      ),
    enabled: enabled && Boolean(id),
  });
}

export function useBankPaymentMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["bank-payments"] });
    void qc.invalidateQueries({ queryKey: ["bank-receipts"] });
    void qc.invalidateQueries({ queryKey: ["deposit-vouchers"] });
    void qc.invalidateQueries({ queryKey: ["deposit-ledger"] });
    void qc.invalidateQueries({ queryKey: ["deposit-accounts"] });
    void qc.invalidateQueries({ queryKey: ["voucher-partners", "supplier-debts"] });
    void qc.invalidateQueries({ queryKey: ["voucher-partners", "supplier-debt-parties"] });
  };

  const create = useMutation({
    mutationFn: async (body: CreateBankPaymentBody) =>
      requireErpData(
        await erpApi.POST<BankPayment>("/bank-payments", { body }),
      ),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateBankPaymentBody }) =>
      requireErpData(
        await erpApi.PATCH<BankPayment>("/bank-payments/{id}", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/bank-payments/{id}", {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidate,
  });

  const post = useMutation({
    mutationFn: async (id: string) =>
      requireErpData(
        await erpApi.POST<BankPayment>("/bank-payments/{id}/post", {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidate,
  });

  const reverse = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      requireErpData(
        await erpApi.POST<{ original: BankPayment; reversal: BankPayment }>(
          "/bank-payments/{id}/reverse",
          { params: { path: { id } }, body: { reason } },
        ),
      ),
    onSuccess: invalidate,
  });

  return { create, update, remove, post, reverse };
}
