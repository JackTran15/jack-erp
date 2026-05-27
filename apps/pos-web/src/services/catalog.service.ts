import { http } from "@erp/pos/lib/common/http";
import type { GetCatalogProductDetailParams } from "@erp/pos/dtos/catalog.dto";
import type {
  PosCatalogLine,
  PosProductDetail,
} from "@erp/pos/interfaces/catalog.interface";
import type { PosCatalogDirection } from "@erp/pos/types/catalog.type";

export const catalogService = {
  fetch: (
    branchId: string,
    search?: string,
    direction?: PosCatalogDirection,
  ): Promise<PosCatalogLine[]> => {
    const params = new URLSearchParams();
    if (search?.trim()) params.set("search", search.trim());
    if (direction) params.set("direction", direction);
    const q = params.toString();
    const path = `/pos/branches/${encodeURIComponent(branchId)}/catalog${q ? `?${q}` : ""}`;
    return http.get<PosCatalogLine[]>(path);
  },

  /** Chi tiết product (gom biến thể) — `GET /pos/branches/:id/catalog/products/:id`. */
  getProductDetail: ({
    branchId,
    id,
    kind,
  }: GetCatalogProductDetailParams): Promise<PosProductDetail> => {
    const qs = kind ? `?kind=${kind}` : "";
    return http.get<PosProductDetail>(
      `/pos/branches/${encodeURIComponent(branchId)}/catalog/products/${encodeURIComponent(id)}${qs}`,
    );
  },
};
