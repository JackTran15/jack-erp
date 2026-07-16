import { useMutation, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type { CreateFundSwapBody } from "../../pages/treasury/bank-vouchers.types";

export function useFundSwapMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateFundSwapBody) =>
      requireErpData(
        await erpApi.POST<Record<string, never>>("/fund-swaps", { body }),
      ),
    onSuccess: () => {
      // A swap moves money between both funds — invalidate both balances + ledgers.
      void qc.invalidateQueries({ queryKey: ["cash-accounts"] });
      void qc.invalidateQueries({ queryKey: ["deposit-accounts"] });
      void qc.invalidateQueries({ queryKey: ["cash-ledger"] });
      void qc.invalidateQueries({ queryKey: ["deposit-ledger"] });
      void qc.invalidateQueries({ queryKey: ["bank-payments"] });
      void qc.invalidateQueries({ queryKey: ["bank-receipts"] });
      void qc.invalidateQueries({ queryKey: ["cash-payments"] });
      void qc.invalidateQueries({ queryKey: ["cash-receipts"] });
    },
  });
}
