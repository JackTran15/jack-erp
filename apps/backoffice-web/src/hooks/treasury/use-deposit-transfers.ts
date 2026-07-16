import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DepositTransfer } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type {
  CancelDepositTransferBody,
  ConfirmDepositTransferBody,
  CreateDepositTransferBody,
  ListDepositTransfersQuery,
  ListDepositTransfersResponse,
} from "../../pages/treasury/deposit-transfer/deposit-transfer.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

/** GĐ4 — chuyển tiền gửi liên chi nhánh. GET /deposit-transfers (branch-scoped, BR-PERM-01). */
export function useDepositTransfers(query: ListDepositTransfersQuery) {
  return useQuery({
    queryKey: treasuryQueryKeys.depositTransfers(query),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<ListDepositTransfersResponse>("/deposit-transfers", {
          params: { query: query as Record<string, unknown> },
        }),
      ),
    staleTime: 15_000,
  });
}

function invalidateDepositTransferData(qc: ReturnType<typeof useQueryClient>) {
  // A transfer moves money out of A's fund (create) or into B's fund (confirm/cancel) —
  // invalidate the transfer list itself plus every report that reflects fund balances.
  void qc.invalidateQueries({ queryKey: ["deposit-transfers"] });
  void qc.invalidateQueries({ queryKey: ["deposit-in-transit"] });
  void qc.invalidateQueries({ queryKey: ["deposit-dashboard"] });
  void qc.invalidateQueries({ queryKey: ["deposit-accounts"] });
  void qc.invalidateQueries({ queryKey: ["deposit-ledger"] });
}

export function useCreateDepositTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateDepositTransferBody) =>
      requireErpData(await erpApi.POST<DepositTransfer>("/deposit-transfers", { body })),
    onSuccess: () => invalidateDepositTransferData(qc),
  });
}

export function useConfirmDepositTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ConfirmDepositTransferBody }) =>
      requireErpData(
        await erpApi.POST<DepositTransfer>("/deposit-transfers/{id}/confirm", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: () => invalidateDepositTransferData(qc),
  });
}

export function useCancelDepositTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: CancelDepositTransferBody }) =>
      requireErpData(
        await erpApi.POST<DepositTransfer>("/deposit-transfers/{id}/cancel", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: () => invalidateDepositTransferData(qc),
  });
}
