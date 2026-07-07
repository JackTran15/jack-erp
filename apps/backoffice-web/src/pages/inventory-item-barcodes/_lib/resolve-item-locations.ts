import { apiClient } from "../../../lib/api-axios";

export interface ResolvedItemLocation {
  itemId: string;
  productId: string | null;
  storageId: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  source: "preferred" | "stock" | "default" | "none";
}

/**
 * Gợi ý Kho/Vị trí mặc định cho các item vừa thêm vào bảng in tem.
 * Endpoint version 2 (URI versioning) — xem ResolveItemLocationsController.
 */
export async function resolveItemLocations(
  variantItemIds: string[],
  branchId: string,
): Promise<ResolvedItemLocation[]> {
  const { data } = await apiClient.post<{ data: ResolvedItemLocation[] }>(
    "/v2/inventory/items/resolve-locations",
    { variantItemIds, branchId },
  );
  return data.data ?? [];
}
