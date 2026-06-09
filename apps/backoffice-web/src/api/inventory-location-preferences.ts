import { erpApi, requireErpData } from "../lib/erp-api";

export interface PreferredShelf {
  id: string;
  code: string;
  name: string;
}

export async function getPreferredShelf(
  itemId: string,
  storageId: string,
): Promise<PreferredShelf | null> {
  return requireErpData<PreferredShelf | null>(
    await erpApi.GET("/inventory/locations/preferred-shelf", {
      params: { query: { itemId, storageId } },
    }),
  );
}
