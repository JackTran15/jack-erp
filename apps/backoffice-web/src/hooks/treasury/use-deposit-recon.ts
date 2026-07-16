import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { apiClient } from "../../lib/api-axios";
import { triggerBlobDownload } from "../../lib/download";
import type {
  ListReconQuery,
  ListReconResponse,
  ReconcileBody,
  ReconcileResponse,
  UnreconcileBody,
  UnreconcileResponse,
} from "../../pages/treasury/deposit-recon/deposit-recon.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

/** Grid đối chiếu tiền gửi (FR-09) — GET /deposit-recon. */
export function useDepositReconList(query: ListReconQuery, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.depositRecon(query),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<ListReconResponse>("/deposit-recon", {
          params: { query: query as Record<string, unknown> },
        }),
      ),
    enabled,
    staleTime: 15_000,
  });
}

/**
 * Reconcile/unreconcile mutations. Both invalidate the recon list AND the
 * deposit ledger/accounts (available balance changes with recon_status via
 * value_date clearing, and the fee-adjustment proposal touches bank-payments).
 */
export function useDepositReconMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["deposit-recon"] });
    void qc.invalidateQueries({ queryKey: ["deposit-ledger"] });
    void qc.invalidateQueries({ queryKey: ["deposit-accounts"] });
    void qc.invalidateQueries({ queryKey: ["bank-payments"] });
  };

  const reconcile = useMutation({
    mutationFn: async (body: ReconcileBody) =>
      requireErpData(
        await erpApi.POST<ReconcileResponse>("/deposit-recon/reconcile", { body }),
      ),
    onSuccess: invalidate,
  });

  const unreconcile = useMutation({
    mutationFn: async (body: UnreconcileBody) =>
      requireErpData(
        await erpApi.POST<UnreconcileResponse>("/deposit-recon/unreconcile", { body }),
      ),
    onSuccess: invalidate,
  });

  return { reconcile, unreconcile };
}

/** Xuất Excel theo filter hiện tại — GET /deposit-recon/export. */
export async function downloadDepositReconExport(query: ListReconQuery): Promise<void> {
  const { data } = await apiClient.get<Blob>("/deposit-recon/export", {
    params: query,
    responseType: "blob",
  });
  triggerBlobDownload(data, "doi-chieu-tien-gui.xlsx");
}
