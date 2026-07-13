import { http } from "@erp/pos/lib/common/http";
import type { GetCatalogProductDetailParams } from "@erp/pos/dtos/catalog.dto";
import type {
  PosCatalogLine,
  PosProductDetail,
  PosProductListResponse,
} from "@erp/pos/interfaces/catalog.interface";
import type { PosCatalogDirection } from "@erp/pos/types/catalog.type";

export interface ListCatalogProductsParams {
  direction?: PosCatalogDirection;
  page?: number;
  pageSize?: number;
  /** Lọc theo danh mục (inventory-item-categories). */
  categoryId?: string;
}

export const catalogService = {
  fetch: (
    branchId: string,
    search?: string,
    direction?: PosCatalogDirection,
    includeUntracked?: boolean,
  ): Promise<PosCatalogLine[]> => {
    const params = new URLSearchParams();
    if (search?.trim()) params.set("search", search.trim());
    if (direction) params.set("direction", direction);
    if (includeUntracked) params.set("includeUntracked", "true");
    const q = params.toString();
    const path = `/pos/branches/${encodeURIComponent(branchId)}/catalog${q ? `?${q}` : ""}`;
    return http.get<PosCatalogLine[]>(path);
  },

  /**
   * Tra khớp tuyệt đối mã vạch / mã SKU — `GET /pos/branches/:id/catalog/lookup`.
   * Trả 0..n dòng (cùng shape catalog) để caller auto-add khi đúng 1 kết quả.
   */
  lookupByCode: (
    branchId: string,
    code: string,
    includeUntracked?: boolean,
  ): Promise<PosCatalogLine[]> => {
    const qs = new URLSearchParams({ code });
    if (includeUntracked) qs.set("includeUntracked", "true");
    return http.get<PosCatalogLine[]>(
      `/pos/branches/${encodeURIComponent(branchId)}/catalog/lookup?${qs.toString()}`,
    );
  },

  /**
   * Danh sách catalog mức PRODUCT (gom biến thể) — `GET /pos/branches/:id/
   * catalog/products`. Phân trang (pageSize ≤ 100), không có tham số search.
   */
  listProducts: (
    branchId: string,
    params: ListCatalogProductsParams = {},
  ): Promise<PosProductListResponse> => {
    const qs = new URLSearchParams();
    if (params.direction) qs.set("direction", params.direction);
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
    if (params.categoryId) qs.set("categoryId", params.categoryId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return http.get<PosProductListResponse>(
      `/pos/branches/${encodeURIComponent(branchId)}/catalog/products${suffix}`,
    );
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
