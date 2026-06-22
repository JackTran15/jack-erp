import { erpApi, requireErpData } from "../lib/erp-api";
import { apiClient } from "../lib/api-axios";

export interface PreferredShelf {
  id: string;
  code: string;
  name: string;
}

export interface PreferredShelfPair {
  itemId: string;
  storageId: string;
}

export interface PreferredShelfBatchRow {
  itemId: string;
  storageId: string;
  shelf: PreferredShelf | null;
}

export async function getPreferredShelfBatch(
  pairs: PreferredShelfPair[],
): Promise<PreferredShelfBatchRow[]> {
  const { data } = requireErpData<{ data: PreferredShelfBatchRow[] }>(
    await erpApi.POST("/inventory/locations/preferred-shelf/batch", {
      body: { pairs },
    }),
  );
  return data;
}

export interface TransferPreferredShelfPair {
  itemId: string;
  sourceStorageId: string;
  destStorageId: string;
}

export interface TransferPreferredShelfBatchRow {
  itemId: string;
  sourceStorageId: string;
  destStorageId: string;
  sourceShelf: PreferredShelf | null;
  destShelf: PreferredShelf | null;
}

// Uses the raw axios client (not the typed erpApi) so this endpoint does not
// require an OpenAPI regen of @erp/api-client. Mirror the body/response shape of
// POST /inventory/locations/preferred-shelf/transfer-batch.
export async function getTransferPreferredShelfBatch(
  pairs: TransferPreferredShelfPair[],
): Promise<TransferPreferredShelfBatchRow[]> {
  const { data } = await apiClient.post<{
    data: TransferPreferredShelfBatchRow[];
  }>("/inventory/locations/preferred-shelf/transfer-batch", { pairs });
  return data.data;
}
