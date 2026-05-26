import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../lib/api-axios";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";
import type {
  CashPayment,
  CashPaymentListQuery,
  CreateCashPaymentBody,
  CreateSupplierDebtPaymentBody,
  SupplierDebtPaymentResult,
  PaginatedList,
} from "../../pages/treasury/cash-vouchers.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

export function useCashPaymentsList(query: CashPaymentListQuery, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashPayments(query),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedList<CashPayment>>("/cash-payments", {
          params: { query: query as Record<string, unknown> },
        }),
      ),
    enabled,
    staleTime: 30_000,
  });
}

export function useCashPayment(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashPayment(id),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<CashPayment>("/cash-payments/{id}", {
          params: { path: { id: id! } },
        }),
      ),
    enabled: enabled && Boolean(id),
  });
}

export function useCashPaymentMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cash-payments"] });
    void qc.invalidateQueries({ queryKey: ["cash-receipts"] });
    void qc.invalidateQueries({ queryKey: ["cash-receipts-payments-merged"] });
    void qc.invalidateQueries({ queryKey: ["cash-ledger"] });
  };

  const create = useMutation({
    mutationFn: async (body: CreateCashPaymentBody) =>
      requireErpData(
        await erpApi.POST<CashPayment>("/cash-payments", { body }),
      ),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<CreateCashPaymentBody> }) =>
      requireErpData(
        await erpApi.PATCH<CashPayment>("/cash-payments/{id}", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/cash-payments/{id}", {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidate,
  });

  const post = useMutation({
    mutationFn: async (id: string) =>
      requireErpData(
        await erpApi.POST<CashPayment>("/cash-payments/{id}/post", {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidate,
  });

  const reverse = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      requireErpData(
        await erpApi.POST<{ original: CashPayment; reversal: CashPayment }>(
          "/cash-payments/{id}/reverse",
          { params: { path: { id } }, body: { reason } },
        ),
      ),
    onSuccess: invalidate,
  });

  const supplierDebtPayment = useMutation({
    mutationFn: async (body: CreateSupplierDebtPaymentBody) => {
      const { data } = await apiClient.post<SupplierDebtPaymentResult>(
        "/cash-payments/supplier-debt-payment",
        body,
      );
      return data;
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["voucher-partners", "supplier-debts"] });
      void qc.invalidateQueries({ queryKey: ["voucher-partners", "supplier-debt-parties"] });
    },
  });

  return { create, update, remove, post, reverse, supplierDebtPayment };
}
