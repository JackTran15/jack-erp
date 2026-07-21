import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type {
  CancelCashTransferBody,
  CashTransfer,
  ConfirmCashTransferBody,
  CreateCashTransferBody,
  ListCashTransfersQuery,
  ListCashTransfersResponse,
} from "../../pages/treasury/cash-transfer/cash-transfer.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

/** Chuyển tiền mặt liên chi nhánh. GET /cash-transfers (branch-scoped). */
export function useCashTransfers(query: ListCashTransfersQuery) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashTransfers(query),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<ListCashTransfersResponse>("/cash-transfers", {
          params: { query: query as Record<string, unknown> },
        }),
      ),
    staleTime: 15_000,
  });
}

/**
 * Single transfer by id — hydrates Cửa hàng nhận / Hình thức nhận / Tài khoản
 * nhận on an INTER_BRANCH_OUT cash_payment's view dialog. Those fields live only
 * on this entity, not on the payment.
 */
export function useCashTransfer(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashTransfer(id),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<CashTransfer>("/cash-transfers/{id}", {
          params: { path: { id: id! } },
        }),
      ),
    enabled: enabled && Boolean(id),
  });
}

function invalidateCashTransferData(qc: ReturnType<typeof useQueryClient>) {
  // A transfer moves money out of A's cash fund (create) or into B's cash fund
  // or deposit account (confirm/cancel) — invalidate the transfer list itself
  // plus every view that reflects those balances.
  void qc.invalidateQueries({ queryKey: ["cash-transfers"] });
  void qc.invalidateQueries({ queryKey: ["cash-vouchers"] });
  void qc.invalidateQueries({ queryKey: ["cash-ledger"] });
  void qc.invalidateQueries({ queryKey: ["cash-accounts"] });
  // Destination may be a deposit account, so the deposit views move too.
  void qc.invalidateQueries({ queryKey: ["deposit-vouchers"] });
  void qc.invalidateQueries({ queryKey: ["deposit-dashboard"] });
  void qc.invalidateQueries({ queryKey: ["deposit-ledger"] });
}

export function useCreateCashTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateCashTransferBody) =>
      requireErpData(await erpApi.POST<CashTransfer>("/cash-transfers", { body })),
    onSuccess: () => invalidateCashTransferData(qc),
  });
}

export function useConfirmCashTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ConfirmCashTransferBody }) =>
      requireErpData(
        await erpApi.POST<CashTransfer>("/cash-transfers/{id}/confirm", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: () => invalidateCashTransferData(qc),
  });
}

export function useCancelCashTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: CancelCashTransferBody }) =>
      requireErpData(
        await erpApi.POST<CashTransfer>("/cash-transfers/{id}/cancel", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: () => invalidateCashTransferData(qc),
  });
}
