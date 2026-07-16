import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type {
  DepositPeriodLock,
  LockPeriodBody,
  UnlockPeriodBody,
} from "../../pages/treasury/deposit-period-lock/deposit-period-lock.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

/** Danh sách kỳ khóa sổ tiền gửi của một chi nhánh — GET /deposit-period-locks. */
export function useDepositPeriodLocks(branchId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.depositPeriodLocks(branchId),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<DepositPeriodLock[]>("/deposit-period-locks", {
          params: { query: { branchId } },
        }),
      ),
    enabled: enabled && Boolean(branchId),
    staleTime: 15_000,
  });
}

/**
 * Lock/unlock mutations. Lock snapshots every deposit account's closing
 * balance for the branch+period — invalidates the lock list only; it does
 * not itself change any balance (unlike reconcile, which touches the ledger).
 */
export function useDepositPeriodLockMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["deposit-period-lock"] });
  };

  const lock = useMutation({
    mutationFn: async (body: LockPeriodBody) =>
      requireErpData(
        await erpApi.POST<DepositPeriodLock>("/deposit-period-locks", { body }),
      ),
    onSuccess: invalidate,
  });

  const unlock = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UnlockPeriodBody }) =>
      requireErpData(
        await erpApi.POST<DepositPeriodLock>("/deposit-period-locks/{id}/unlock", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });

  return { lock, unlock };
}
