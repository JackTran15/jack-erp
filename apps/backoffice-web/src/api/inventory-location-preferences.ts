import { erpApi, requireErpData } from "../lib/erp-api";

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
