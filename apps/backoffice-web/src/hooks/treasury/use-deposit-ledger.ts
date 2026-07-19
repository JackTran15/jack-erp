import { useQuery } from "@tanstack/react-query";
import type { DepositLedgerResponse } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { apiClient } from "../../lib/api-axios";
import { triggerBlobDownload } from "../../lib/download";
import { treasuryQueryKeys } from "./treasury-query-keys";

export interface DepositLedgerParams {
  depositAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Fetch one offset page of the deposit ledger. Omit `depositAccountId` to cover
 * every ACTIVE deposit account of the branch (BR-LEDG-04) instead of one.
 */
export function useDepositLedger(
  params: DepositLedgerParams,
  page: number,
  pageSize: number,
  enabled = true,
) {
  const canQuery = Boolean(params.dateFrom) && Boolean(params.dateTo);

  return useQuery({
    queryKey: treasuryQueryKeys.depositLedger({ ...params, page, pageSize }),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<DepositLedgerResponse>("/deposit-ledger", {
          params: {
            query: {
              depositAccountId: params.depositAccountId,
              dateFrom: params.dateFrom,
              dateTo: params.dateTo,
              page,
              pageSize,
            },
          },
        }),
      ),
    enabled: enabled && canQuery,
    staleTime: 30_000,
  });
}

/** Download the deposit-ledger Excel export for the given account + date range. */
export async function downloadDepositLedgerExport(
  params: DepositLedgerParams,
): Promise<void> {
  const { data } = await apiClient.get<Blob>("/deposit-ledger/export", {
    params: {
      depositAccountId: params.depositAccountId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    },
    responseType: "blob",
  });
  triggerBlobDownload(data, "so-chi-tiet-tien-gui.xlsx");
}
