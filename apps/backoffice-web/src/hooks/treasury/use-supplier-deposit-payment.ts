import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type {
  CreateSupplierDepositPaymentBody,
  SupplierDepositPaymentSagaResult,
} from "../../pages/treasury/bank-vouchers.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

export function useSupplierDepositPaymentSaga(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.supplierDepositPaymentSaga(id),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<SupplierDepositPaymentSagaResult>(
          "/supplier-deposit-payment/sagas/{id}",
          { params: { path: { id: id! } } },
        ),
      ),
    enabled: enabled && Boolean(id),
  });
}

export function useSupplierDepositPaymentMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateSupplierDepositPaymentBody) =>
      requireErpData(
        await erpApi.POST<SupplierDepositPaymentSagaResult>(
          "/supplier-deposit-payment",
          { body },
        ),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bank-payments"] });
      void qc.invalidateQueries({ queryKey: ["deposit-vouchers"] });
      void qc.invalidateQueries({ queryKey: ["cash-payments"] });
      void qc.invalidateQueries({ queryKey: ["deposit-ledger"] });
      void qc.invalidateQueries({ queryKey: ["deposit-accounts"] });
      void qc.invalidateQueries({ queryKey: ["cash-accounts"] });
      void qc.invalidateQueries({ queryKey: ["voucher-partners", "supplier-debts"] });
      void qc.invalidateQueries({ queryKey: ["voucher-partners", "supplier-debt-parties"] });
    },
  });
}
