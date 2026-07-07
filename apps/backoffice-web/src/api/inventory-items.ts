import { apiClient } from "../lib/api-axios";

/** Bulk toggle `is_active` for inventory items (ngừng theo dõi / sử dụng lại). */
export async function setItemsActiveStatus(
  ids: string[],
  isActive: boolean,
): Promise<{ updated: number }> {
  const { data } = await apiClient.patch<{ updated: number }>(
    "/inventory/items/status",
    { ids, isActive },
  );
  return data;
}
