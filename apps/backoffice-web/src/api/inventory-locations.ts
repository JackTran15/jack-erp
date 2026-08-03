import type { LocationType } from "@erp/shared-interfaces";
import { apiClient } from "../lib/api-axios";
import type { V2SearchResponse } from "../components/crud/crudV2Search";

export interface LocationRow {
  id: string;
  code: string;
  name: string;
  storageId: string;
  branchId: string | null;
  type: LocationType;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  hasItems: boolean;
}

/**
 * Server-side filtered location list ("Vị trí hàng hóa"). The body is produced
 * by `buildV2Body` from the per-column filter state; branch scope comes from the
 * `X-Branch-Id` header injected by `apiClient`.
 */
export async function searchLocationsV2(
  body: Record<string, unknown>,
): Promise<V2SearchResponse<LocationRow>> {
  const { data } = await apiClient.post<V2SearchResponse<LocationRow>>(
    "/v2/inventory/locations/search",
    body,
  );
  return data;
}
