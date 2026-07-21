import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { apiClient } from "../../lib/api-axios";
import type {
  CreateFundSwapBody,
  FundSwapLeg,
} from "../../pages/treasury/bank-vouchers.types";

/**
 * Sibling vouchers of a fund swap, so a leg can show "Tham chiếu <counterpart>".
 * Both legs share one `referenceId`, written when the swap is created.
 */
export function useFundSwapLegs(swapId: string | undefined) {
  return useQuery({
    queryKey: ["fund-swaps", "legs", swapId],
    queryFn: async () => {
      const { data } = await apiClient.get<FundSwapLeg[]>(
        `/fund-swaps/${swapId}/legs`,
      );
      return data;
    },
    enabled: Boolean(swapId),
    staleTime: 60_000,
  });
}

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
      void qc.invalidateQueries({ queryKey: ["deposit-vouchers"] });
      void qc.invalidateQueries({ queryKey: ["cash-payments"] });
      void qc.invalidateQueries({ queryKey: ["cash-receipts"] });
    },
  });
}
