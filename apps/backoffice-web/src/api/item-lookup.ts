import { apiClient } from "../lib/api-axios";

// Item lookup result by code (SKU or barcode match). Mirrors the ItemLookupResultDto
// shape returned by GET /inventory/items/lookup, a superset of the item that
// ProductSelectDialog needs (sku = code).
export interface ItemLookupResult {
  itemId: string;
  productId: string | null;
  code: string;
  name: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  variantLabel: string | null;
  categoryName: string | null;
}

// Uses raw axios (not the typed erpApi), so no @erp/api-client regen is needed; run
// `pnpm openapi:generate` later to sync the typed client. The API returns a bare array
// (no interceptor wrapping it in {data}), so read `res.data` directly.
export async function lookupItemByCode(code: string): Promise<ItemLookupResult[]> {
  const trimmed = code.trim();
  if (!trimmed) return [];
  const { data } = await apiClient.get<ItemLookupResult[]>(
    `/inventory/items/lookup?code=${encodeURIComponent(trimmed)}`,
  );
  return data;
}
