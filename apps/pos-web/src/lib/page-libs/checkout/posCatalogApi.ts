import { http } from "@erp/pos/lib/common/http";

export type PosCatalogDirection = "warehouse" | "showroom";

export type PosCatalogLine = {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  sellingPrice: number;
  quantityOnHand: number;
  locations: { locationId: string; name: string; quantity: number }[];
  defaultLocationId: string;
};

export async function fetchPosCatalog(
  branchId: string,
  search?: string,
  direction?: PosCatalogDirection,
): Promise<PosCatalogLine[]> {
  const params = new URLSearchParams();
  if (search?.trim()) params.set("search", search.trim());
  if (direction) params.set("direction", direction);
  const q = params.toString();
  const path = `/pos/branches/${encodeURIComponent(branchId)}/catalog${q ? `?${q}` : ""}`;
  return http.get<PosCatalogLine[]>(path);
}
